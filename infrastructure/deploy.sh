#!/bin/bash
set -e

AWS_REGION="us-east-1"
PROJECT_NAME="support-copilot"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

KNOWLEDGE_BUCKET="${PROJECT_NAME}-knowledge-${ACCOUNT_ID}"
FRONTEND_BUCKET="${PROJECT_NAME}-frontend-${ACCOUNT_ID}"
LAMBDA_ROLE_NAME="${PROJECT_NAME}-lambda-role"
CHAT_LAMBDA_NAME="${PROJECT_NAME}-chat-handler"
RULES_LAMBDA_NAME="${PROJECT_NAME}-rules-admin"
API_NAME="${PROJECT_NAME}-api"

SESSIONS_TABLE="SupportCopilot-Sessions"
RULES_TABLE="SupportCopilot-Rules"
USERS_TABLE="SupportCopilot-Users"
ESCALATIONS_TABLE="SupportCopilot-Escalations"

echo "============================================"
echo "  Deploying Agentic Support Copilot"
echo "  Region: ${AWS_REGION}"
echo "  Account: ${ACCOUNT_ID}"
echo "============================================"

echo ""
echo "[Step 1/8] Creating DynamoDB tables..."

for TABLE_NAME in "$SESSIONS_TABLE" "$RULES_TABLE" "$USERS_TABLE" "$ESCALATIONS_TABLE"; do
    if [ "$TABLE_NAME" = "$SESSIONS_TABLE" ]; then
        KEY_NAME="session_id"
    elif [ "$TABLE_NAME" = "$RULES_TABLE" ]; then
        KEY_NAME="rule_id"
    elif [ "$TABLE_NAME" = "$USERS_TABLE" ]; then
        KEY_NAME="user_id"
    elif [ "$TABLE_NAME" = "$ESCALATIONS_TABLE" ]; then
        KEY_NAME="escalation_id"
    fi

    if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$AWS_REGION" 2>/dev/null; then
        echo "  Table $TABLE_NAME already exists, skipping..."
    else
        aws dynamodb create-table \
            --table-name "$TABLE_NAME" \
            --attribute-definitions AttributeName="$KEY_NAME",AttributeType=S \
            --key-schema AttributeName="$KEY_NAME",KeyType=HASH \
            --billing-mode PAY_PER_REQUEST \
            --region "$AWS_REGION"
        echo "  Created table: $TABLE_NAME"
    fi
done

echo "  Waiting for tables to be active..."
for TABLE_NAME in "$SESSIONS_TABLE" "$RULES_TABLE" "$USERS_TABLE" "$ESCALATIONS_TABLE"; do
    aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$AWS_REGION"
done
echo "  All tables are active!"

echo ""
echo "[Step 2/8] Creating S3 buckets..."

if aws s3 ls "s3://${KNOWLEDGE_BUCKET}" 2>/dev/null; then
    echo "  Knowledge bucket already exists, skipping..."
else
    aws s3 mb "s3://${KNOWLEDGE_BUCKET}" --region "$AWS_REGION"
    echo "  Created bucket: ${KNOWLEDGE_BUCKET}"
fi

if aws s3 ls "s3://${FRONTEND_BUCKET}" 2>/dev/null; then
    echo "  Frontend bucket already exists, skipping..."
else
    aws s3 mb "s3://${FRONTEND_BUCKET}" --region "$AWS_REGION"
    echo "  Created bucket: ${FRONTEND_BUCKET}"
fi

echo ""
echo "[Step 3/8] Uploading knowledge base documents..."

aws s3 sync knowledge-base/ "s3://${KNOWLEDGE_BUCKET}/" --region "$AWS_REGION"
echo "  Knowledge base documents uploaded!"

echo ""
echo "[Step 4/8] Creating IAM role for Lambda..."

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}'

if aws iam get-role --role-name "$LAMBDA_ROLE_NAME" 2>/dev/null; then
    echo "  IAM role already exists, skipping creation..."
else
    aws iam create-role \
        --role-name "$LAMBDA_ROLE_NAME" \
        --assume-role-policy-document "$TRUST_POLICY"
    echo "  Created IAM role: ${LAMBDA_ROLE_NAME}"
fi

LAMBDA_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:'"${AWS_REGION}"':'"${ACCOUNT_ID}"':table/SupportCopilot-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::'"${KNOWLEDGE_BUCKET}"'",
        "arn:aws:s3:::'"${KNOWLEDGE_BUCKET}"'/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "*"
    }
  ]
}'

aws iam put-role-policy \
    --role-name "$LAMBDA_ROLE_NAME" \
    --policy-name "${PROJECT_NAME}-lambda-policy" \
    --policy-document "$LAMBDA_POLICY"

echo "  IAM policies attached!"
echo "  Waiting 10 seconds for role propagation..."
sleep 10

LAMBDA_ROLE_ARN=$(aws iam get-role --role-name "$LAMBDA_ROLE_NAME" --query 'Role.Arn' --output text)

echo ""
echo "[Step 5/8] Creating Lambda functions..."

cd backend/lambda
zip -r ../../chat_handler.zip chat_handler.py
zip -r ../../rules_admin.zip rules_admin.py
cd ../..

if aws lambda get-function --function-name "$CHAT_LAMBDA_NAME" --region "$AWS_REGION" 2>/dev/null; then
    echo "  Updating Chat Handler Lambda..."
    aws lambda update-function-code \
        --function-name "$CHAT_LAMBDA_NAME" \
        --zip-file fileb://chat_handler.zip \
        --region "$AWS_REGION"
else
    aws lambda create-function \
        --function-name "$CHAT_LAMBDA_NAME" \
        --runtime python3.12 \
        --handler chat_handler.lambda_handler \
        --role "$LAMBDA_ROLE_ARN" \
        --zip-file fileb://chat_handler.zip \
        --timeout 60 \
        --memory-size 256 \
        --environment "Variables={SESSIONS_TABLE=${SESSIONS_TABLE},RULES_TABLE=${RULES_TABLE},ESCALATIONS_TABLE=${ESCALATIONS_TABLE},KNOWLEDGE_BUCKET=${KNOWLEDGE_BUCKET},MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0}" \
        --region "$AWS_REGION"
    echo "  Created Chat Handler Lambda!"
fi

if aws lambda get-function --function-name "$RULES_LAMBDA_NAME" --region "$AWS_REGION" 2>/dev/null; then
    echo "  Updating Rules Admin Lambda..."
    aws lambda update-function-code \
        --function-name "$RULES_LAMBDA_NAME" \
        --zip-file fileb://rules_admin.zip \
        --region "$AWS_REGION"
else
    aws lambda create-function \
        --function-name "$RULES_LAMBDA_NAME" \
        --runtime python3.12 \
        --handler rules_admin.lambda_handler \
        --role "$LAMBDA_ROLE_ARN" \
        --zip-file fileb://rules_admin.zip \
        --timeout 30 \
        --memory-size 128 \
        --environment "Variables={RULES_TABLE=${RULES_TABLE}}" \
        --region "$AWS_REGION"
    echo "  Created Rules Admin Lambda!"
fi

rm -f chat_handler.zip rules_admin.zip

echo ""
echo "[Step 6/8] Creating API Gateway..."

EXISTING_API_ID=$(aws apigateway get-rest-apis --region "$AWS_REGION" \
    --query "items[?name=='${API_NAME}'].id" --output text)

if [ -n "$EXISTING_API_ID" ] && [ "$EXISTING_API_ID" != "None" ]; then
    API_ID="$EXISTING_API_ID"
    echo "  API Gateway already exists: ${API_ID}"
else
    API_ID=$(aws apigateway create-rest-api \
        --name "$API_NAME" \
        --description "Agentic Support Copilot API" \
        --endpoint-configuration types=REGIONAL \
        --region "$AWS_REGION" \
        --query 'id' --output text)
    echo "  Created API Gateway: ${API_ID}"
fi

ROOT_RESOURCE_ID=$(aws apigateway get-resources \
    --rest-api-id "$API_ID" \
    --region "$AWS_REGION" \
    --query 'items[?path==`/`].id' --output text)

CHAT_RESOURCE_ID=$(aws apigateway get-resources \
    --rest-api-id "$API_ID" \
    --region "$AWS_REGION" \
    --query "items[?path=='/chat'].id" --output text)

if [ -z "$CHAT_RESOURCE_ID" ] || [ "$CHAT_RESOURCE_ID" = "None" ]; then
    CHAT_RESOURCE_ID=$(aws apigateway create-resource \
        --rest-api-id "$API_ID" \
        --parent-id "$ROOT_RESOURCE_ID" \
        --path-part "chat" \
        --region "$AWS_REGION" \
        --query 'id' --output text)
    echo "  Created /chat resource"
fi

RULES_RESOURCE_ID=$(aws apigateway get-resources \
    --rest-api-id "$API_ID" \
    --region "$AWS_REGION" \
    --query "items[?path=='/rules'].id" --output text)

if [ -z "$RULES_RESOURCE_ID" ] || [ "$RULES_RESOURCE_ID" = "None" ]; then
    RULES_RESOURCE_ID=$(aws apigateway create-resource \
        --rest-api-id "$API_ID" \
        --parent-id "$ROOT_RESOURCE_ID" \
        --path-part "rules" \
        --region "$AWS_REGION" \
        --query 'id' --output text)
    echo "  Created /rules resource"
fi

setup_method() {
    local RESOURCE_ID=$1
    local HTTP_METHOD=$2
    local LAMBDA_NAME=$3
    local LAMBDA_ARN="arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:${LAMBDA_NAME}"
    local LAMBDA_URI="arn:aws:apigateway:${AWS_REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations"

    aws apigateway put-method \
        --rest-api-id "$API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method "$HTTP_METHOD" \
        --authorization-type NONE \
        --region "$AWS_REGION" 2>/dev/null || true

    aws apigateway put-integration \
        --rest-api-id "$API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method "$HTTP_METHOD" \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "$LAMBDA_URI" \
        --region "$AWS_REGION" 2>/dev/null || true

    aws lambda add-permission \
        --function-name "$LAMBDA_NAME" \
        --statement-id "apigateway-${HTTP_METHOD}-${RESOURCE_ID}" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:${AWS_REGION}:${ACCOUNT_ID}:${API_ID}/*/${HTTP_METHOD}/*" \
        --region "$AWS_REGION" 2>/dev/null || true
}

enable_cors() {
    local RESOURCE_ID=$1

    aws apigateway put-method \
        --rest-api-id "$API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region "$AWS_REGION" 2>/dev/null || true

    aws apigateway put-integration \
        --rest-api-id "$API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
        --region "$AWS_REGION" 2>/dev/null || true

    aws apigateway put-method-response \
        --rest-api-id "$API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' \
        --region "$AWS_REGION" 2>/dev/null || true

    aws apigateway put-integration-response \
        --rest-api-id "$API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,Authorization'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'"}' \
        --region "$AWS_REGION" 2>/dev/null || true
}

echo "  Setting up /chat POST method..."
setup_method "$CHAT_RESOURCE_ID" "POST" "$CHAT_LAMBDA_NAME"
enable_cors "$CHAT_RESOURCE_ID"

echo "  Setting up /rules methods..."
setup_method "$RULES_RESOURCE_ID" "GET" "$RULES_LAMBDA_NAME"
setup_method "$RULES_RESOURCE_ID" "POST" "$RULES_LAMBDA_NAME"
setup_method "$RULES_RESOURCE_ID" "DELETE" "$RULES_LAMBDA_NAME"
enable_cors "$RULES_RESOURCE_ID"

echo "  Deploying API..."
aws apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name prod \
    --region "$AWS_REGION"

API_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/prod"
echo "  API deployed at: ${API_URL}"

echo ""
echo "[Step 7/8] Deploying frontend..."

sed -i "s|YOUR_API_GATEWAY_URL_HERE|${API_URL}|g" frontend/src/app.js

aws s3 website "s3://${FRONTEND_BUCKET}" \
    --index-document index.html \
    --error-document index.html \
    --region "$AWS_REGION"

BUCKET_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::'"${FRONTEND_BUCKET}"'/*"
    }
  ]
}'

aws s3api put-public-access-block \
    --bucket "$FRONTEND_BUCKET" \
    --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
    --region "$AWS_REGION"

aws s3api put-bucket-policy \
    --bucket "$FRONTEND_BUCKET" \
    --policy "$BUCKET_POLICY" \
    --region "$AWS_REGION"

aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}/" \
    --region "$AWS_REGION" \
    --content-type "text/html" \
    --exclude "*" --include "*.html"

aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}/" \
    --region "$AWS_REGION" \
    --content-type "text/css" \
    --exclude "*" --include "*.css"

aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}/" \
    --region "$AWS_REGION" \
    --content-type "application/javascript" \
    --exclude "*" --include "*.js"

FRONTEND_URL="http://${FRONTEND_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com"
echo "  Frontend deployed at: ${FRONTEND_URL}"

echo ""
echo "[Step 8/8] Seeding default workflow rules..."

curl -s -X POST "${API_URL}/rules" \
    -H "Content-Type: application/json" \
    -d '{
        "rule_name": "Auto-Refund Small Orders",
        "action": "refund",
        "condition": "amount <= 50",
        "max_amount": 50,
        "auto_approve": true,
        "requires_approval": false
    }' > /dev/null

curl -s -X POST "${API_URL}/rules" \
    -H "Content-Type: application/json" \
    -d '{
        "rule_name": "Refund Medium Orders - Approval Required",
        "action": "refund",
        "condition": "amount > 50 AND amount <= 200",
        "max_amount": 200,
        "auto_approve": false,
        "requires_approval": true
    }' > /dev/null

curl -s -X POST "${API_URL}/rules" \
    -H "Content-Type: application/json" \
    -d '{
        "rule_name": "Auto Password Reset",
        "action": "password_reset",
        "condition": "verified_email = true",
        "max_amount": 0,
        "auto_approve": true,
        "requires_approval": false
    }' > /dev/null

curl -s -X POST "${API_URL}/rules" \
    -H "Content-Type: application/json" \
    -d '{
        "rule_name": "Large Refund - Manager Escalation",
        "action": "escalate",
        "condition": "amount > 200",
        "max_amount": 500,
        "auto_approve": false,
        "requires_approval": true
    }' > /dev/null

echo "  Default rules seeded!"

echo ""
echo "============================================"
echo "  DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo "  Frontend URL: ${FRONTEND_URL}"
echo "  API URL:      ${API_URL}"
echo ""
echo "  API Endpoints:"
echo "    POST ${API_URL}/chat   - Send chat messages"
echo "    GET  ${API_URL}/rules  - List workflow rules"
echo "    POST ${API_URL}/rules  - Create a rule"
echo "    DELETE ${API_URL}/rules - Delete a rule"
echo ""
echo "  DynamoDB Tables:"
echo "    - ${SESSIONS_TABLE}"
echo "    - ${RULES_TABLE}"
echo "    - ${USERS_TABLE}"
echo "    - ${ESCALATIONS_TABLE}"
echo ""
echo "  S3 Buckets:"
echo "    - ${KNOWLEDGE_BUCKET} (knowledge base)"
echo "    - ${FRONTEND_BUCKET} (frontend)"
echo ""
echo "  Next Steps:"
echo "    1. Open ${FRONTEND_URL} in your browser"
echo "    2. Try chatting with the AI assistant"
echo "    3. Try quick actions: Refund, Password Reset, etc."
echo "    4. Click 'Admin Panel' to manage rules"
echo "============================================"
