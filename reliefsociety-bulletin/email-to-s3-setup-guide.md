# Email-to-S3 PDF Pipeline — AWS Setup Guide

## Architecture Summary

| Component | Service | Purpose |
|---|---|---|
| Email receiving | AWS SES | Accepts inbound email, applies receipt rules |
| Raw email storage | S3 (temp bucket) | SES stores the raw MIME message here |
| Processing | Lambda (Python) | Parses email, validates sender, extracts PDF |
| PDF storage | S3 (your existing bucket) | Final destination for uploaded PDFs |
| Secure access | CloudFront + OAC | Read-only public/CDN access to PDF bucket |
| Reply | SES SendEmail | Notifies sender when no PDF is attached |

**Free tier coverage (monthly):**
- SES: 1,000 emails received free
- Lambda: 1M invocations / 400,000 GB-seconds free
- S3: 5 GB storage / 20K GET / 2K PUT free
- CloudFront: 1 TB data transfer / 10M requests free

---

## Prerequisites

- AWS account with admin access
- A domain you control (e.g. `example.com`) — SES requires domain verification to receive email
- An existing S3 bucket for PDF storage (referred to as `pdf-destination-bucket` below)
- AWS CLI installed and configured (`aws configure`)

---

## Deployment (CloudFormation)

The entire pipeline is defined in `email-to-s3-pipeline.yaml`. Deploy with:

```bash
aws cloudformation deploy \
  --template-file email-to-s3-pipeline.yaml \
  --stack-name email-pdf-ingest \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    PDFDestinationBucketName=your-existing-bucket \
    RecipientEmailAddress=pdfingest@yourdomain.com \
    ReplyFromAddress=noreply@yourdomain.com \
    AllowedSenders="alice@example.com,bob@company.org"
```

### One manual step after deploy — activate the SES rule set

CloudFormation cannot set a rule set as active. After the stack finishes, run:

```bash
aws ses set-active-receipt-rule-set --rule-set-name email-pdf-ingest-rules
```

Or activate it in the SES console under **Configuration > Email receiving**.

---

## Step 1 — Verify Your Domain in SES

SES must verify your domain before it can receive email on your behalf.

1. Go to **SES → Verified identities → Create identity**
2. Choose **Domain**, enter your domain (e.g. `example.com`)
3. Enable **Easy DKIM** and keep all defaults
4. AWS gives you a set of DNS records — add them to your domain's DNS (CNAME for DKIM, MX for receiving)

**Critical MX record** (add this to DNS so email routes to SES):

```
Type: MX
Name: @   (or subdomain like mail)
Value: 10 inbound-smtp.us-east-1.amazonaws.com
Priority: 10
```

> Replace `us-east-1` with your chosen AWS region. SES email receiving is only available in: `us-east-1`, `us-west-2`, and `eu-west-1`.

Wait for domain status to show **Verified** (usually 5–30 minutes).

---

## Testing

### Send a test email

Send to `pdfingest@yourdomain.com` from an allowed address with a PDF attached.

### Check Lambda logs

```bash
aws logs tail /aws/lambda/email-pdf-ingest-EmailPdfProcessor --follow --region us-east-1
```

### Verify PDF appeared in S3

```bash
aws s3 ls s3://pdf-destination-bucket/pdfs/ --region us-east-1
```

### Test the unauthorised-sender path

Send from an address not in `AllowedSenders`. Lambda logs "Rejected" and uploads nothing.

### Test the no-PDF path

Send from an allowed address with no attachment. You should receive an automated reply.

---

## Updating the Allowed Sender List

No redeployment needed. Use the pre-filled command from the stack Outputs, or:

```bash
aws lambda update-function-configuration \
  --function-name email-pdf-ingest-EmailPdfProcessor \
  --environment "Variables={ALLOWED_SENDERS=alice@example.com,bob@company.org,...}" \
  --region us-east-1
```

> Include ALL existing env vars in the `Variables` map — Lambda replaces the entire environment on each update. Use the `UpdateAllowedSendersCommand` output for the pre-filled version.

---

## Security Notes

- **SES sandbox mode** — by default you can only send email to verified addresses until you request production access. Receiving email is unrestricted.
- Raw email staging bucket auto-deletes objects after 7 days (lifecycle rule included in template).
- Unauthorised senders are silently dropped — no reply, to prevent email enumeration.
- Direct S3 URLs return 403 — only CloudFront (via OAC) can serve PDFs publicly.
- Lambda writes directly to S3 via the AWS SDK, bypassing CloudFront (correct and intended).

---

## Notes on the PDF Bucket Policy

The CloudFormation template **replaces** any existing policy on your PDF destination bucket with a two-statement policy:
1. CloudFront OAC → `s3:GetObject` (read via distribution only)
2. Lambda IAM role → `s3:PutObject` (write to `pdfs/` prefix only)

If your bucket has other policy statements you need to keep, merge them manually before deploying.
