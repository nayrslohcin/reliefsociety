# reliefsociety-bulletin

Email-to-website pipeline for Relief Society bulletin distribution.

Receives email via AWS SES, validates the sender against an allowlist (and confirms with SES's SPF/DMARC, spam and virus checks that the email really came from that sender), extracts an `rsbulletin.html` attachment, and uploads it to an S3 bucket served through CloudFront. Unauthorized senders and wrong recipients are silently dropped and the admin is notified. Authorized senders who forget to attach `rsbulletin.html` receive an automated reply.

## Architecture

| Component | Service | Purpose |
|---|---|---|
| Email receiving | AWS SES | Accepts inbound email, applies receipt rules |
| Raw email storage | S3 (staging bucket) | SES stores the raw MIME message transiently (auto-deleted after 7 days) |
| Processing | Lambda (Python) | Validates sender + recipient, extracts `rsbulletin.html`, notifies admin |
| Website storage | S3 (website bucket) | Hosts the uploaded `rsbulletin.html` |
| Secure CDN access | CloudFront + OAC | HTTPS-only, US-only geo-restriction, `X-Robots-Tag: noindex` |
| DNS | Route 53 | Hosted zone, MX, A, DKIM, DMARC records — all managed by the stack |
| SSL | ACM | Auto-validated certificate for apex + www |

## Files

| File | Description |
|---|---|
| `email-to-s3-pipeline.yaml` | CloudFormation template — deploys the full pipeline |
| `deploy-policy.json` | IAM policy required to deploy the stack |
| `email-to-s3-setup-guide.md` | Step-by-step setup guide |
| `docs/architecture.html` | Architecture diagram — download and open in a browser. Made with [archify](https://github.com/tt-a1i/archify) from `docs/architecture.json`; rebuild from this folder with `node <path-to-archify>/bin/archify.mjs finalize architecture docs/architecture.json docs/architecture.html --repo-root .. --quality showcase` |

## Variables

Collect these values before running any deploy or update commands.

| Variable | Description | Where to find it |
|---|---|---|
| `<YOUR_ACCOUNT_ID>` | 12-digit AWS account ID | AWS console → top-right account menu, or `aws sts get-caller-identity --query Account --output text` |
| `<YOUR_DOMAIN>` | Your registered domain (e.g. `example.org`) | Route 53 → Registered domains |
| `<BUCKET_NAME>` | S3 bucket name for the website | Choose a globally unique name, e.g. `my-bulletin-site` |
| `<RECIPIENTEMAILADDRESS>` | Email address that receives bulletin submissions | e.g. `bulletin@example.org` |
| `<NOREPLYFROMADDRESS>` | Verified SES address used to send automated replies | e.g. `noreply@example.org` |
| `<SENDER1_EMAIL>` | First allowed sender email address | Known to you |
| `<SENDER2_EMAIL>` | Second allowed sender email address | Known to you |
| `<ADMIN_EMAIL>` | Email that receives unauthorized sender alerts | Known to you |

### Variables stored in Lambda environment

Once deployed, the following variables can be retrieved directly from the Lambda function rather than tracked separately:

```bash
aws lambda get-function-configuration \
  --function-name email-pdf-ingest-EmailPdfProcessor \
  --region us-east-1 \
  --query "Environment.Variables" \
  --output table
```

| Lambda Variable | Corresponds to |
|---|---|
| `ALLOWED_SENDERS` | `<SENDER1_EMAIL>,<SENDER2_EMAIL>` |
| `RECIPIENT_EMAIL` | `<RECIPIENTEMAILADDRESS>` |
| `REPLY_FROM` | `<NOREPLYFROMADDRESS>` |
| `ADMIN_EMAIL` | `<ADMIN_EMAIL>` |
| `PDF_DESTINATION_BUCKET` | `<BUCKET_NAME>` |
| `RAW_EMAIL_BUCKET` | Staging bucket — auto-named `email-pdf-ingest-raw-emails-staging` |
| `SES_REGION` | AWS region the stack was deployed to |

## AWS Profile

All CLI commands in this guide require the correct AWS profile to be set. Run this before executing any commands:

```bash
export AWS_PROFILE=<IAM_USER>
```

Replace `<IAM_USER>` with the profile name configured in `~/.aws/credentials` that has the `EmailPdfIngestDeploy` policy attached. You can verify the active identity with:

```bash
aws sts get-caller-identity
```

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

Send an email with `rsbulletin.html` attached to `<RECIPIENTEMAILADDRESS>` from an allowed sender address. The attachment must have exactly that name: the bulletin editor downloads `ReliefSocietyBulletin_<date>.html`, so rename it to `rsbulletin.html` before attaching it. Then verify the file was uploaded:

```bash
aws s3 ls s3://<BUCKET_NAME>/ --region us-east-1
```

Check Lambda logs if anything seems off:
```bash
aws logs tail /aws/lambda/email-pdf-ingest-EmailPdfProcessor --follow --region us-east-1
```

**Test paths:**
- Allowed sender + `rsbulletin.html` attached → file uploaded to S3, site updates
- Allowed sender + no `rsbulletin.html` → automated reply sent to sender
- Allowed sender's address, but SES can't confirm they sent it (SPF and DMARC both fail), or it fails the spam/virus scan → not published, admin gets a "Bulletin email rejected" notice
- Unauthorized sender → silently dropped, admin notified at `<ADMIN_EMAIL>`
- Email sent to wrong address → silently dropped, admin notified at `<ADMIN_EMAIL>`

## Adding / Removing / Updating Email Addresses

No redeployment needed. Lambda replaces the **entire** environment on each update so you must include all existing variables — not just `ALLOWED_SENDERS`.

**Step 1 — Get the current environment variables:**
```bash
aws lambda get-function-configuration \
  --function-name email-pdf-ingest-EmailPdfProcessor \
  --region us-east-1 \
  --query "Environment.Variables" \
  --output json
```

**Step 2 — Update with the full variable set including your changes:**

> Use JSON format (single quotes) — the shorthand `Variables={...}` syntax fails on email addresses containing `@` and `.`.

```bash
aws lambda update-function-configuration \
  --function-name email-pdf-ingest-EmailPdfProcessor \
  --region us-east-1 \
  --environment '{"Variables":{"ALLOWED_SENDERS":"<SENDER1_EMAIL>,<SENDER2_EMAIL>","RAW_EMAIL_BUCKET":"email-pdf-ingest-raw-emails-staging","PDF_DESTINATION_BUCKET":"<BUCKET_NAME>","PDF_PREFIX":"pdfs/","REPLY_FROM":"<NOREPLYFROMADDRESS>","SES_REGION":"us-east-1","ADMIN_EMAIL":"<ADMIN_EMAIL>","RECIPIENT_EMAIL":"<RECIPIENTEMAILADDRESS>"}}'
```

Use the output from Step 1 to fill in all variables, then modify `ALLOWED_SENDERS` as needed — add, remove, or update addresses in the comma-separated list.

**Step 3 — If still in SES sandbox mode, verify any new address:**
```bash
aws sesv2 create-email-identity --email-identity <NEW_EMAIL> --region us-east-1
```

Click the verification link AWS sends to that address. This step is not required if your account has SES production access.

## Cost

| Service | Cost |
|---|---|
| Route 53 hosted zone | $0.50/month |
| Everything else | Free tier (at low traffic volumes) |

**Estimated total: ~$0.50/month**
