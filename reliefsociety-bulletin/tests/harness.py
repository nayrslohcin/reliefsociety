"""Runs the Lambda code from email-to-s3-pipeline.yaml with fake AWS clients.

The Lambda's Python lives inline in the template (Code: ZipFile), so the tests
pull it out of the template itself: what they test is exactly what deploys.
boto3 is replaced by fakes that record every call, so nothing touches AWS.
"""

import os
import sys
import textwrap
import types
import unittest
from email.message import EmailMessage
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "email-to-s3-pipeline.yaml"

RECIPIENT = "bulletin@ward.example.org"
REPLY_FROM = "noreply@ward.example.org"
ADMIN = "admin@ward.example.org"
SENDER = "editor@yahoo.example.com"

ENV = {
    "RAW_EMAIL_BUCKET": "raw-bucket",
    "PDF_DESTINATION_BUCKET": "site-bucket",
    "PDF_PREFIX": "pdfs/",
    "ALLOWED_SENDERS": f"{SENDER},second@example.org",
    "REPLY_FROM": REPLY_FROM,
    "SES_REGION": "us-east-1",
    "ADMIN_EMAIL": ADMIN,
    "RECIPIENT_EMAIL": RECIPIENT,
    "CLOUDFRONT_DISTRIBUTION_ID": "EDIST123",
}

PASSING = {"virusVerdict": "PASS", "spamVerdict": "PASS", "spfVerdict": "PASS", "dmarcVerdict": "PASS"}


def lambda_source():
    """The Python under `ZipFile: |` in the template, with the YAML indent removed."""
    lines = TEMPLATE.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == "ZipFile: |") + 1
    indent = len(lines[start]) - len(lines[start].lstrip())
    body = []
    for line in lines[start:]:
        if line.strip() and len(line) - len(line.lstrip()) < indent:
            break
        body.append(line)
    return textwrap.dedent("\n".join(body))


class FakeAWS:
    """Stands in for every boto3 client the Lambda creates, recording each call."""

    def __init__(self):
        self.calls = []        # (service, method, kwargs) in call order
        self.raw_emails = {}   # SES message id -> raw bytes in the staging bucket
        self.fail = set()      # method names that should raise

    def client(self, service, **_):
        return FakeClient(self, service)

    def sent(self):
        """Every SES send_email call's arguments."""
        return [kw for svc, method, kw in self.calls if method == "send_email"]

    def made(self, method):
        return [kw for svc, m, kw in self.calls if m == method]


class FakeClient:
    def __init__(self, aws, service):
        self._aws = aws
        self._service = service

    def _record(self, method, kwargs):
        self._aws.calls.append((self._service, method, kwargs))
        if method in self._aws.fail:
            raise RuntimeError(f"{method} failed")

    def get_object(self, **kw):
        self._record("get_object", kw)
        if kw["Key"] not in self._aws.raw_emails:
            raise RuntimeError("NoSuchKey")
        data = self._aws.raw_emails[kw["Key"]]
        return {"Body": types.SimpleNamespace(read=lambda: data)}

    def put_object(self, **kw):
        self._record("put_object", kw)

    def create_invalidation(self, **kw):
        self._record("create_invalidation", kw)

    def send_email(self, **kw):
        self._record("send_email", kw)


def load_lambda(aws):
    """Imports the template's Lambda code as a fresh module wired to `aws`."""
    fake_boto3 = types.ModuleType("boto3")
    fake_boto3.client = aws.client
    saved = sys.modules.get("boto3")
    sys.modules["boto3"] = fake_boto3
    try:
        module = types.ModuleType("bulletin_lambda")
        exec(compile(lambda_source(), str(TEMPLATE), "exec"), module.__dict__)
    finally:
        if saved is None:
            del sys.modules["boto3"]
        else:
            sys.modules["boto3"] = saved
    return module


def raw_email(sender=SENDER, subject="This week's bulletin", attachment="rsbulletin.html",
              content=b"<html>bulletin</html>", body="See attached."):
    """A raw MIME email, optionally with one HTML attachment."""
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = RECIPIENT
    msg["Subject"] = subject
    msg.set_content(body)
    if attachment:
        msg.add_attachment(content, maintype="text", subtype="html", filename=attachment)
    return msg.as_bytes()


def ses_record(msg_id="msg-1", sender=SENDER, recipients=(RECIPIENT,), verdicts=None,
               header_from=None):
    """One SES receipt record, as SES passes it to the Lambda."""
    receipt = {"recipients": list(recipients)}
    for name, status in (PASSING if verdicts is None else verdicts).items():
        receipt[name] = {"status": status}
    return {"ses": {
        "mail": {
            "messageId": msg_id,
            "source": sender,
            "commonHeaders": {"from": [sender] if header_from is None else header_from},
        },
        "receipt": receipt,
    }}


def event(*records):
    return {"Records": list(records)}


class LambdaTestCase(unittest.TestCase):
    """Each test gets fresh fake AWS clients and a freshly loaded Lambda."""

    def setUp(self):
        self.aws = FakeAWS()
        self.lam = load_lambda(self.aws)

    def run_lambda(self, evt, **env_overrides):
        """Calls lambda_handler with ENV plus overrides (None unsets a variable)."""
        env = {k: v for k, v in dict(ENV, **env_overrides).items() if v is not None}
        with mock.patch.dict(os.environ, env, clear=True):
            return self.lam.lambda_handler(evt, None)

    def send(self, email_bytes=None, msg_id="msg-1", **record_args):
        """Stores an email in the staging bucket and runs the Lambda on it."""
        self.aws.raw_emails[msg_id] = raw_email() if email_bytes is None else email_bytes
        return self.run_lambda(event(ses_record(msg_id=msg_id, **record_args)))

    def assertPublished(self):
        self.assertEqual(len(self.aws.made("put_object")), 1, "expected the bulletin to be published")

    def assertNotPublished(self):
        self.assertEqual(self.aws.made("put_object"), [], "expected nothing to be published")

    def only_email(self):
        """The one email SES was asked to send: (to, subject, body)."""
        sent = self.aws.sent()
        self.assertEqual(len(sent), 1, f"expected one email, got {sent}")
        kw = sent[0]
        return (kw["Destination"]["ToAddresses"], kw["Message"]["Subject"]["Data"],
                kw["Message"]["Body"]["Text"]["Data"])
