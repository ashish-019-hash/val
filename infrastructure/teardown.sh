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
echo "  Tearing down Agentic Support Copilot"
echo "  Region: ${AWS_REGION}"
echo "============================================"
echo ""
echo "WARNING: This will delete ALL resources!"
read -p "Are you sure? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "[1/6] Deleting API Gateway..."
API_ID=$(aws apigateway get-rest-apis --region "$AWS_REGION" \
    --query "items[?name=='${API_NAME}'].id" --output text)
if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
    aws apigateway delete-rest-api --rest-api-id "$API_ID" --region "$AWS_REGION"
    echo "  Deleted API: ${API_ID}"
else
    echo "  No API found, skipping..."
fi

echo ""
echo "[2/6] Deleting Lambda functions..."
for FUNC in "$CHAT_LAMBDA_NAME" "$RULES_LAMBDA_NAME"; do
    if aws lambda get-function --function-name "$FUNC" --region "$AWS_REGION" 2>/dev/null; then
        aws lambda delete-function --function-name "$FUNC" --region "$AWS_REGION"
        echo "  Deleted Lambda: ${FUNC}"
    else
        echo "  Lambda ${FUNC} not found, skipping..."
    fi
done

echo ""
echo "[3/6] Deleting IAM role and policies..."
if aws iam get-role --role-name "$LAMBDA_ROLE_NAME" 2>/dev/null; then
    aws iam delete-role-policy \
        --role-name "$LAMBDA_ROLE_NAME" \
        --policy-name "${PROJECT_NAME}-lambda-policy" 2>/dev/null || true
    aws iam delete-role --role-name "$LAMBDA_ROLE_NAME"
    echo "  Deleted IAM role: ${LAMBDA_ROLE_NAME}"
else
    echo "  IAM role not found, skipping..."
fi

echo ""
echo "[4/6] Deleting S3 buckets..."
for BUCKET in "$KNOWLEDGE_BUCKET" "$FRONTEND_BUCKET"; do
    if aws s3 ls "s3://${BUCKET}" 2>/dev/null; then
        aws s3 rm "s3://${BUCKET}" --recursive
        aws s3 rb "s3://${BUCKET}"
        echo "  Deleted bucket: ${BUCKET}"
    else
        echo "  Bucket ${BUCKET} not found, skipping..."
    fi
done

echo ""
echo "[5/6] Deleting DynamoDB tables..."
for TABLE_NAME in "$SESSIONS_TABLE" "$RULES_TABLE" "$USERS_TABLE" "$ESCALATIONS_TABLE"; do
    if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$AWS_REGION" 2>/dev/null; then
        aws dynamodb delete-table --table-name "$TABLE_NAME" --region "$AWS_REGION"
        echo "  Deleted table: ${TABLE_NAME}"
    else
        echo "  Table ${TABLE_NAME} not found, skipping..."
    fi
done

echo ""
echo "[6/6] Cleanup complete!"
echo "============================================"
echo "  All resources have been deleted."
echo "============================================"
