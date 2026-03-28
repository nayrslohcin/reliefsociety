# reliefsociety-bulletin

Email-to-S3 PDF ingestion pipeline for Relief Society bulletin distribution.

Receives email via AWS SES, validates the sender against an allowlist, extracts PDF attachments, and uploads them to an S3 bucket served through CloudFront. Replies to authorized senders when no PDF is found.

## Files

| File | Description |
|---|---|
| `email-to-s3-pipeline.yaml` | CloudFormation template — deploys the full pipeline in one command |
| `email-to-s3-setup-guide.md` | Step-by-step setup guide (domain verification, deployment, testing) |

## Quick Deploy

**Step 1 — Update the IAM policy:**
```bash
aws iam create-policy-version \
  --policy-arn arn:aws:iam::<YOUR_ACCOUNT_ID>:policy/EmailPdfIngestDeploy \
  --policy-document file://deploy-policy.json \
  --set-as-default
```

**Step 2 — Phase 1 deploy (creates infrastructure + hosted zone):**
```bash
aws cloudformation deploy \
  --template-file email-to-s3-pipeline.yaml \
  --stack-name email-pdf-ingest \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides \
    PDFDestinationBucketName=reliefsociety-bulletin \
    RecipientEmailAddress=<RECIPIENTEMAILADDRESS> \
    ReplyFromAddress=<NOREPLYFROMADDRESS> \
    AllowedSenders="<SENDER1_EMAIL>,<SENDER2_EMAIL>" \
    NameserversReady=false
```

**Step 3 — Update domain nameservers:**

Get the nameservers from the stack outputs:
```bash
aws cloudformation describe-stacks \
  --stack-name email-pdf-ingest \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='HostedZoneNameServers'].OutputValue" \
  --output text
```

Update the registered domain to use these nameservers:
```bash
aws route53domains update-domain-nameservers \
  --region us-east-1 \
  --domain-name plano4reliefsocietybulletin.org \
  --nameservers Name=<NS1> Name=<NS2> Name=<NS3> Name=<NS4>
```

Wait for propagation (usually 15–30 min, up to 48h). Verify with:
```bash
dig NS plano4reliefsocietybulletin.org +short
```

**Step 4 — Phase 2 deploy (activates SSL certificate + custom domain):**
```bash
aws cloudformation deploy \
  --template-file email-to-s3-pipeline.yaml \
  --stack-name email-pdf-ingest \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --parameter-overrides \
    PDFDestinationBucketName=reliefsociety-bulletin \
    RecipientEmailAddress=<RECIPIENTEMAILADDRESS> \
    ReplyFromAddress=<NOREPLYFROMADDRESS> \
    AllowedSenders="<SENDER1_EMAIL>,<SENDER2_EMAIL>" \
    NameserversReady=true
```

**Step 5 — Activate the SES rule set (one-time manual step):**
```bash
aws ses set-active-receipt-rule-set --rule-set-name email-pdf-ingest-rules --region us-east-1
```

See [email-to-s3-setup-guide.md](email-to-s3-setup-guide.md) for full instructions.
