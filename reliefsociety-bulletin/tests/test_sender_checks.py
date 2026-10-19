"""An allowlisted address is only trusted once SES's scan confirms the email."""

import unittest

from harness import ADMIN, PASSING, SENDER, LambdaTestCase, event, ses_record


def verdicts(**changes):
    """PASSING with some verdicts changed; a value of None leaves that verdict out."""
    v = dict(PASSING, **changes)
    return {k: s for k, s in v.items() if s is not None}


class SenderCheckTests(LambdaTestCase):

    def assertRejected(self, reason_text):
        self.assertNotPublished()
        to, subject, body = self.only_email()
        self.assertEqual(to, [ADMIN])
        self.assertEqual(subject, "Bulletin email rejected")
        self.assertIn(SENDER, body)
        self.assertIn(reason_text, body)

    # ── Passing ──

    def test_yahoo_style_email_passing_spf_and_dmarc_is_published(self):
        self.send(verdicts=PASSING)
        self.assertPublished()

    def test_spf_pass_alone_is_enough(self):
        self.send(verdicts=verdicts(dmarcVerdict="FAIL"))
        self.assertPublished()

    def test_dmarc_pass_with_matching_from_header_is_enough(self):
        self.send(verdicts=verdicts(spfVerdict="FAIL"))
        self.assertPublished()

    def test_dmarc_from_header_with_display_name_still_matches(self):
        self.send(verdicts=verdicts(spfVerdict="FAIL"),
                  header_from=[f'"Ward Editor" <{SENDER.upper()}>'])
        self.assertPublished()

    def test_spam_gray_is_allowed(self):
        self.send(verdicts=verdicts(spamVerdict="GRAY"))
        self.assertPublished()

    # ── Rejected ──

    def test_spf_and_dmarc_both_failing_is_rejected(self):
        self.send(verdicts=verdicts(spfVerdict="FAIL", dmarcVerdict="FAIL"))
        self.assertRejected("SES could not confirm it really came from that address")

    def test_dmarc_pass_for_a_different_from_header_is_rejected(self):
        # Forged envelope sender: DMARC passed, but for someone else's From address.
        self.send(verdicts=verdicts(spfVerdict="FAIL"), header_from=["attacker@example.net"])
        self.assertRejected("SES could not confirm")

    def test_dmarc_pass_with_several_from_addresses_is_rejected(self):
        self.send(verdicts=verdicts(spfVerdict="SOFTFAIL"),
                  header_from=[SENDER, "attacker@example.net"])
        self.assertRejected("SES could not confirm")

    def test_spf_softfail_or_none_counts_as_not_passing(self):
        for status in ("SOFTFAIL", "NEUTRAL", "NONE", "TEMPFAIL", "PERMFAIL"):
            with self.subTest(status=status):
                self.setUp()
                self.send(verdicts=verdicts(spfVerdict=status, dmarcVerdict="NONE"))
                self.assertRejected("SES could not confirm")

    def test_virus_found_is_rejected(self):
        self.send(verdicts=verdicts(virusVerdict="FAIL"))
        self.assertRejected("it did not pass the virus scan")

    def test_virus_scan_missing_is_rejected(self):
        # Without ScanEnabled on the receipt rule, SES sends no verdicts at all.
        self.send(verdicts=verdicts(virusVerdict=None))
        self.assertRejected("it did not pass the virus scan")

    def test_no_verdicts_at_all_is_rejected(self):
        self.send(verdicts={})
        self.assertRejected("virus scan")

    def test_spam_is_rejected(self):
        self.send(verdicts=verdicts(spamVerdict="FAIL"))
        self.assertRejected("it was flagged as spam")

    def test_rejected_email_is_never_read_from_the_bucket(self):
        self.send(verdicts=verdicts(spfVerdict="FAIL", dmarcVerdict="FAIL"))
        self.assertEqual(self.aws.made("get_object"), [])

    def test_rejected_email_with_no_admin_sends_nothing(self):
        self.run_lambda(event(ses_record(verdicts=verdicts(virusVerdict="FAIL"))), ADMIN_EMAIL=None)
        self.assertNotPublished()
        self.assertEqual(self.aws.sent(), [])


if __name__ == "__main__":
    unittest.main()
