#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="email-pdf-ingest"
REGION="us-east-1"
FUNCTION_NAME="${STACK_NAME}-EmailPdfProcessor"

echo "Fetching Lambda environment variables from ${FUNCTION_NAME} ..."
get_var() {
  aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query "Environment.Variables.${1}" \
    --output text
}

BUCKET=$(get_var PDF_DESTINATION_BUCKET)
ALLOWED_SENDERS=$(get_var ALLOWED_SENDERS)
REPLY_FROM=$(get_var REPLY_FROM)
ADMIN_EMAIL=$(get_var ADMIN_EMAIL)
RECIPIENT_EMAIL=$(get_var RECIPIENT_EMAIL)

echo "  PDF_DESTINATION_BUCKET : ${BUCKET}"
echo "  ALLOWED_SENDERS        : ${ALLOWED_SENDERS}"
echo "  REPLY_FROM             : ${REPLY_FROM}"
echo "  ADMIN_EMAIL            : ${ADMIN_EMAIL}"
echo "  RECIPIENT_EMAIL        : ${RECIPIENT_EMAIL}"

aws cloudformation deploy \
  --template-file email-to-s3-pipeline.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --parameter-overrides \
    PDFDestinationBucketName="$BUCKET" \
    RecipientEmailAddress="$RECIPIENT_EMAIL" \
    ReplyFromAddress="$REPLY_FROM" \
    AllowedSenders="$ALLOWED_SENDERS" \
    AdminEmail="$ADMIN_EMAIL" \
    NameserversReady=true

echo "Syncing s3-files/ to s3://${BUCKET}/ ..."
aws s3 sync s3-files/ "s3://${BUCKET}/" --region "$REGION"

echo "Deploy complete."
