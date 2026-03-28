# reliefsociety-bulletin

Email-to-website pipeline for Relief Society bulletin distribution.

Receives email via AWS SES, validates the sender against an allowlist, extracts an `index.html` attachment, and uploads it to an S3 bucket served through CloudFront. Unauthorized senders and wrong recipients are silently dropped and the admin is notified. Authorized senders who forget to attach `index.html` receive an automated reply.

## Architecture

| Component | Service | Purpose |
|---|---|---|
| Email receiving | AWS SES | Accepts inbound email, applies receipt rules |
| Raw email storage | S3 (staging bucket) | SES stores the raw MIME message transiently (auto-deleted after 7 days) |
| Processing | Lambda (Python) | Validates sender + recipient, extracts `index.html`, notifies admin |
| Website storage | S3 (website bucket) | Hosts the uploaded `index.html` |
| Secure CDN access | CloudFront + OAC | HTTPS-only, US-only geo-restriction, `X-Robots-Tag: noindex` |
| DNS | Route 53 | Hosted zone, MX, A, DKIM, DMARC records — all managed by the stack |
| SSL | ACM | Auto-validated certificate for apex + www |

## Files

| File | Description |
|---|---|
| `email-to-s3-pipeline.yaml` | CloudFormation template — deploys the full pipeline |
| `deploy-policy.json` | IAM policy required to deploy the stack |
| `email-to-s3-setup-guide.md` | Step-by-step setup guide |

## Prerequisites

- AWS account with the `EmailPdfIngestDeploy` IAM policy attached to your user
- A domain registered in Route 53
- AWS CLI installed and configured (`aws configure`)
- SES sandbox: verify sender addresses and admin email before testing (or request production access)

## Deploy

The deploy is split into two phases because the ACM certificate cannot be created until the domain's nameservers are pointing to Route 53.

### Phase 1 — Infrastructure + hosted zone

**Step 1 — Create or update the IAM policy:**
```bash
aws iam create-policy \
  --policy-name EmailPdfIngestDeploy \
  --policy-document file://deploy-policy.json
```

> If the policy already exists, use `create-policy-version` instead:
> ```bash
> aws iam create-policy-version \
>   --policy-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:policy/EmailPdfIngestDeploy \
>   --policy-document file://deploy-policy.json \
>   --set-as-default
> ```

**Step 2 — Phase 1 deploy:**
```bash
aws cloudformation deploy \
  --template-file email-to-s3-pipeline.yaml \
  --stack-name email-pdf-ingest \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides \
    PDFDestinationBucketName=<BUCKET_NAME> \
    RecipientEmailAddress=<RECIPIENTEMAILADDRESS> \
    ReplyFromAddress=<NOREPLYFROMADDRESS> \
    AllowedSenders="<SENDER1_EMAIL>,<SENDER2_EMAIL>" \
    AdminEmail=<ADMIN_EMAIL> \
    NameserversReady=false
```

**Step 3 — Point domain nameservers to Route 53:**

Get the nameservers from the stack outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name email-pdf-ingest \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='HostedZoneNameServers'].OutputValue" \
  --output text
```

Update the registered domain:
```bash
aws route53domains update-domain-nameservers \
  --region us-east-1 \
  --domain-name <YOUR_DOMAIN> \
  --nameservers Name=<NS1> Name=<NS2> Name=<NS3> Name=<NS4>
```

Wait for propagation (usually 15–30 min, up to 48h). Verify with:
```bash
dig NS <YOUR_DOMAIN> +short
```

### Phase 2 — SSL certificate + custom domain

**Step 4 — Phase 2 deploy:**
```bash
aws cloudformation deploy \
  --template-file email-to-s3-pipeline.yaml \
  --stack-name email-pdf-ingest \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides \
    PDFDestinationBucketName=<BUCKET_NAME> \
    RecipientEmailAddress=<RECIPIENTEMAILADDRESS> \
    ReplyFromAddress=<NOREPLYFROMADDRESS> \
    AllowedSenders="<SENDER1_EMAIL>,<SENDER2_EMAIL>" \
    AdminEmail=<ADMIN_EMAIL> \
    NameserversReady=true
```

### Post-deploy (one-time manual steps)

**Step 5 — Activate the SES rule set:**
```bash
aws ses set-active-receipt-rule-set --rule-set-name email-pdf-ingest-rules --region us-east-1
```

**Step 6 — Verify email addresses in SES sandbox:**

While your SES account is in sandbox mode, all sender and admin addresses must be verified:
```bash
aws sesv2 create-email-identity --email-identity <SENDER1_EMAIL> --region us-east-1
aws sesv2 create-email-identity --email-identity <SENDER2_EMAIL> --region us-east-1
aws sesv2 create-email-identity --email-identity <ADMIN_EMAIL> --region us-east-1
```

Each address will receive a verification email from AWS — click the link to verify. To remove this restriction, request SES production access in the SES console under **Account dashboard → Request production access**.

## Testing

Send an email with `index.html` attached to `<RECIPIENTEMAILADDRESS>` from an allowed sender address. Then verify the file was uploaded:

```bash
aws s3 ls s3://<BUCKET_NAME>/ --region us-east-1
```

Check Lambda logs if anything seems off:
```bash
aws logs tail /aws/lambda/email-pdf-ingest-EmailPdfProcessor --follow --region us-east-1
```

**Test paths:**
- Allowed sender + `index.html` attached → file uploaded to S3, site updates
- Allowed sender + no `index.html` → automated reply sent to sender
- Unauthorized sender → silently dropped, admin notified at `<ADMIN_EMAIL>`
- Email sent to wrong address → silently dropped, admin notified at `<ADMIN_EMAIL>`

## Updating the Allowed Sender List

No redeployment needed:
```bash
aws lambda update-function-configuration \
  --function-name email-pdf-ingest-EmailPdfProcessor \
  --environment "Variables={ALLOWED_SENDERS=<SENDER1_EMAIL>,<SENDER2_EMAIL>,RAW_EMAIL_BUCKET=email-pdf-ingest-raw-emails-staging,PDF_DESTINATION_BUCKET=<BUCKET_NAME>,PDF_PREFIX=pdfs/,REPLY_FROM=<NOREPLYFROMADDRESS>,SES_REGION=us-east-1,ADMIN_EMAIL=<ADMIN_EMAIL>,RECIPIENT_EMAIL=<RECIPIENTEMAILADDRESS>}" \
  --region us-east-1
```

> Include ALL existing env vars — Lambda replaces the entire environment on each update.

## Cost

| Service | Cost |
|---|---|
| Route 53 hosted zone | $0.50/month |
| Everything else | Free tier (at low traffic volumes) |

**Estimated total: ~$0.50/month**
