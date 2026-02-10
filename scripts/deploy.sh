#!/bin/bash
set -e

echo "=========================================="
echo "  GeeksGreeks Support Copilot - Deployer"
echo "=========================================="
echo ""

STAGE=${1:-dev}
REGION=${2:-us-east-1}
ADMIN_EMAIL=${3:-admin@example.com}

echo "Stage:       $STAGE"
echo "Region:      $REGION"
echo "Admin Email: $ADMIN_EMAIL"
echo ""

command -v aws >/dev/null 2>&1 || { echo "ERROR: AWS CLI is not installed. Please install it first."; exit 1; }
command -v sam >/dev/null 2>&1 || { echo "ERROR: AWS SAM CLI is not installed. Please install it first."; exit 1; }

echo "[1/5] Validating SAM template..."
sam validate --template template.yaml --region "$REGION"
echo "Template is valid."
echo ""

echo "[2/5] Building Lambda functions..."
sam build --template template.yaml --use-container
echo "Build complete."
echo ""

echo "[3/5] Deploying to AWS (this may take 5-10 minutes on first deploy)..."
sam deploy \
    --stack-name "geeksgreeks-copilot-${STAGE}" \
    --region "$REGION" \
    --parameter-overrides "Stage=${STAGE} AdminEmail=${ADMIN_EMAIL}" \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --resolve-s3 \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset
echo "Backend deployment complete."
echo ""

echo "[4/5] Getting stack outputs..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "geeksgreeks-copilot-${STAGE}" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
    --output text)

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name "geeksgreeks-copilot-${STAGE}" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" \
    --output text)

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "geeksgreeks-copilot-${STAGE}" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
    --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "geeksgreeks-copilot-${STAGE}" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
    --output text)

FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "geeksgreeks-copilot-${STAGE}" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
    --output text)

KB_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "geeksgreeks-copilot-${STAGE}" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='KnowledgeBaseBucketName'].OutputValue" \
    --output text)

echo ""
echo "[5/5] Deploying frontend to S3..."
aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}/" --delete --region "$REGION"
echo "Frontend deployment complete."
echo ""

echo "Uploading knowledge base documents..."
aws s3 sync knowledge_base/ "s3://${KB_BUCKET}/knowledge/" --region "$REGION"
echo "Knowledge base uploaded."
echo ""

echo "=========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Your application is live at:"
echo ""
echo "  Website URL:     ${CLOUDFRONT_URL}"
echo "  API URL:         ${API_URL}"
echo "  User Pool ID:    ${USER_POOL_ID}"
echo "  App Client ID:   ${CLIENT_ID}"
echo ""
echo "NEXT STEPS:"
echo "  1. Open ${CLOUDFRONT_URL} in your browser"
echo "  2. Enter the API URL, User Pool ID, and Client ID in the setup screen"
echo "  3. Create a user in Cognito (see README for instructions)"
echo "  4. Start chatting with the AI support copilot!"
echo ""
echo "  Check your email (${ADMIN_EMAIL}) to confirm the SNS subscription"
echo "  for escalation notifications."
echo ""
