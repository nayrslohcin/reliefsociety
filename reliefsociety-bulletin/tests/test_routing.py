"""What the Lambda does with each kind of email it receives."""

import unittest

from harness import (ADMIN, RECIPIENT, REPLY_FROM, SENDER, LambdaTestCase, event,
                     raw_email, ses_record)


class PublishTests(LambdaTestCase):

    def test_allowed_sender_with_attachment_publishes_the_bulletin(self):
        self.send(raw_email(content=b"<html>this week</html>"))

        [put] = self.aws.made("put_object")
        self.assertEqual(put["Bucket"], "site-bucket")
        self.assertEqual(put["Key"], "rsbulletin.html")
        self.assertEqual(put["Body"], b"<html>this week</html>")
        self.assertEqual(put["ContentType"], "text/html")
        self.assertEqual(put["Metadata"], {"sender": SENDER, "message-id": "msg-1"})

    def test_publishing_clears_the_cloudfront_cache(self):
        self.send(msg_id="msg-42")

        [inv] = self.aws.made("create_invalidation")
        self.assertEqual(inv["DistributionId"], "EDIST123")
        self.assertEqual(inv["InvalidationBatch"]["Paths"], {"Quantity": 1, "Items": ["/rsbulletin.html"]})
        self.assertEqual(inv["InvalidationBatch"]["CallerReference"], "msg-42")

    def test_publishing_tells_the_admin(self):
        self.send()

        to, subject, body = self.only_email()
        self.assertEqual(to, [ADMIN])
        self.assertEqual(subject, "Bulletin updated successfully")
        self.assertIn(SENDER, body)
        self.assertEqual(self.aws.sent()[0]["Source"], REPLY_FROM)

    def test_attachment_name_is_not_case_sensitive(self):
        self.send(raw_email(attachment="RSBulletin.HTML"))
        self.assertPublished()

    def test_sender_and_recipient_case_and_spaces_are_ignored(self):
        self.send(sender="  Editor@Yahoo.Example.COM ", recipients=["Bulletin@Ward.Example.org"],
                  header_from=["Editor@Yahoo.Example.COM"])
        self.assertPublished()

    def test_no_cloudfront_distribution_still_publishes(self):
        self.aws.raw_emails["msg-1"] = raw_email()
        self.run_lambda(event(ses_record()), CLOUDFRONT_DISTRIBUTION_ID=None)

        self.assertPublished()
        self.assertEqual(self.aws.made("create_invalidation"), [])

    def test_no_admin_email_still_publishes_without_notifying(self):
        self.aws.raw_emails["msg-1"] = raw_email()
        self.run_lambda(event(ses_record()), ADMIN_EMAIL=None)

        self.assertPublished()
        self.assertEqual(self.aws.sent(), [])

    def test_failed_success_notice_is_logged_not_raised(self):
        self.aws.fail.add("send_email")
        with self.assertLogs(level="ERROR"):
            self.send()
        self.assertPublished()

    def test_every_record_in_the_event_is_handled(self):
        self.aws.raw_emails["a"] = raw_email()
        self.aws.raw_emails["b"] = raw_email()
        self.run_lambda(event(ses_record(msg_id="a"), ses_record(msg_id="b")))

        self.assertEqual([p["Metadata"]["message-id"] for p in self.aws.made("put_object")], ["a", "b"])

    def test_handler_returns_200(self):
        self.assertEqual(self.send(), {"statusCode": 200})


class MissingAttachmentTests(LambdaTestCase):

    def test_no_attachment_replies_to_the_sender(self):
        self.send(raw_email(attachment=None, subject="Bulletin"))

        self.assertNotPublished()
        to, subject, body = self.only_email()
        self.assertEqual(to, [SENDER])
        self.assertEqual(subject, "Re: Bulletin — missing rsbulletin.html attachment")
        self.assertIn("rsbulletin.html", body)

    def test_editor_download_name_is_not_accepted(self):
        # The editor saves ReliefSocietyBulletin_<date>.html; it has to be renamed.
        self.send(raw_email(attachment="ReliefSocietyBulletin_2026-10-18.html"))

        self.assertNotPublished()
        to, _, _ = self.only_email()
        self.assertEqual(to, [SENDER])

    def test_empty_attachment_is_not_published(self):
        with self.assertLogs(level="WARNING"):
            self.send(raw_email(content=b""))
        self.assertNotPublished()


class WrongRecipientTests(LambdaTestCase):

    def test_email_to_another_address_alerts_the_admin(self):
        self.send(recipients=["someone-else@ward.example.org"])

        self.assertNotPublished()
        self.assertEqual(self.aws.made("get_object"), [], "the email should not be read")
        to, subject, body = self.only_email()
        self.assertEqual(to, [ADMIN])
        self.assertEqual(subject, "Wrong recipient alert")
        self.assertIn("someone-else@ward.example.org", body)

    def test_recipient_check_is_skipped_when_recipient_email_is_unset(self):
        self.aws.raw_emails["msg-1"] = raw_email()
        self.run_lambda(event(ses_record(recipients=["other@ward.example.org"])), RECIPIENT_EMAIL=None)
        self.assertPublished()

    def test_recipient_among_several_is_accepted(self):
        self.send(recipients=["other@ward.example.org", RECIPIENT])
        self.assertPublished()


class UnauthorizedSenderTests(LambdaTestCase):

    def test_sender_not_on_the_allowlist_is_forwarded_to_the_admin(self):
        self.send(raw_email(sender="stranger@example.net", subject="Hello", body="Please publish"),
                  sender="stranger@example.net")

        self.assertNotPublished()
        to, subject, body = self.only_email()
        self.assertEqual(to, [ADMIN])
        self.assertEqual(subject, "Fwd from stranger@example.net: Hello")
        self.assertIn("Please publish", body)

    def test_no_admin_email_means_no_forward(self):
        self.aws.raw_emails["msg-1"] = raw_email()
        self.run_lambda(event(ses_record(sender="stranger@example.net")), ADMIN_EMAIL=None)

        self.assertNotPublished()
        self.assertEqual(self.aws.sent(), [])

    def test_allowlist_entries_may_have_spaces_after_commas(self):
        self.aws.raw_emails["msg-1"] = raw_email()
        self.run_lambda(event(ses_record()), ALLOWED_SENDERS=f"first@example.org, {SENDER}")
        self.assertPublished()

    def test_email_with_no_sender_is_not_allowed(self):
        # SES always sets a sender, but an empty one must never match the allowlist.
        self.aws.raw_emails["msg-1"] = raw_email()
        self.run_lambda(event(ses_record(sender="", header_from=[])), ALLOWED_SENDERS=f"{SENDER},")
        self.assertNotPublished()


class BadInputTests(LambdaTestCase):

    def test_record_without_message_id_is_skipped(self):
        self.run_lambda(event(ses_record(msg_id=None)))
        self.assertEqual(self.aws.calls, [])

    def test_email_missing_from_staging_bucket_is_logged_and_skipped(self):
        with self.assertLogs(level="ERROR"):
            self.run_lambda(event(ses_record(msg_id="gone")))
        self.assertNotPublished()
        self.assertEqual(self.aws.sent(), [])

    def test_empty_event_does_nothing(self):
        self.assertEqual(self.run_lambda({}), {"statusCode": 200})
        self.assertEqual(self.aws.calls, [])


if __name__ == "__main__":
    unittest.main()
