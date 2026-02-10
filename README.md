# Agentic Support Copilot

AI-powered customer support system with safe actions, RAG-based knowledge retrieval, workflow guardrails, and escalation management.

**Team:** GeeksGreeks  
**Domain:** Customer Experience & Support

## Architecture

```
[Browser] --> [S3 Static Website] --> [API Gateway] --> [Lambda Functions] --> [Bedrock AI + DynamoDB]
```

### AWS Services Used (Minimum for Prototype)

| Service | Purpose |
|---|---|
| Amazon S3 | Host frontend + knowledge base docs |
| Amazon API Gateway | REST API (`/chat`, `/rules`) |
| AWS Lambda | Serverless backend (Python 3.12) |
| Amazon Bedrock | AI/LLM (Claude 3 Sonnet) |
| Amazon DynamoDB | Sessions, Rules, Users, Escalations |

## Project Structure

```
agentic-support-copilot/
  backend/lambda/
    chat_handler.py        # Main chatbot Lambda function
    rules_admin.py         # Admin rules management Lambda
    requirements.txt       # Python dependencies
  frontend/
    index.html             # Chat UI
    src/app.js             # Frontend logic
    src/styles.css         # Styling
  knowledge-base/
    faq.txt                # FAQ document for RAG
    refund-policy.txt      # Refund policy document
  infrastructure/
    deploy.sh              # One-command deployment script
    teardown.sh            # Cleanup script to delete all resources
```

## Features

- Chat UI with AI-powered responses via Amazon Bedrock (Claude 3)
- RAG: Knowledge base search from S3 documents
- Workflow rules engine with guardrails (auto-approve, manual approval, escalation)
- Safe account actions (refunds, password resets) with configurable limits
- Sentiment-aware escalation to human agents
- Admin panel for managing workflow rules
- Conversation history stored in DynamoDB

## Prerequisites

1. AWS account with billing enabled
2. AWS CLI v2 configured (`aws configure`)
3. Amazon Bedrock model access enabled for Claude 3 Sonnet
4. Python 3.9+ and zip utility

## Quick Start - Deploy

From the project root directory:

```bash
chmod +x infrastructure/deploy.sh
./infrastructure/deploy.sh
```

The script will:
1. Create 4 DynamoDB tables
2. Create 2 S3 buckets (knowledge base + frontend)
3. Upload knowledge base documents
4. Create IAM role with required permissions
5. Deploy 2 Lambda functions
6. Create and configure API Gateway with CORS
7. Deploy frontend to S3 with static website hosting
8. Seed default workflow rules

After deployment, you'll see:
- **Frontend URL** - Open this in your browser
- **API URL** - Used by the frontend automatically

## Quick Start - Teardown

To delete all AWS resources:

```bash
chmod +x infrastructure/teardown.sh
./infrastructure/teardown.sh
```

## Configuration

### Environment Variables (Lambda)

| Variable | Default | Description |
|---|---|---|
| `SESSIONS_TABLE` | `SupportCopilot-Sessions` | DynamoDB sessions table |
| `RULES_TABLE` | `SupportCopilot-Rules` | DynamoDB rules table |
| `ESCALATIONS_TABLE` | `SupportCopilot-Escalations` | DynamoDB escalations table |
| `KNOWLEDGE_BUCKET` | `support-copilot-knowledge-base` | S3 bucket for FAQ docs |
| `MODEL_ID` | `anthropic.claude-3-sonnet-20240229-v1:0` | Bedrock model ID |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/chat` | Send a chat message |
| GET | `/rules` | List all workflow rules |
| POST | `/rules` | Create a new rule |
| DELETE | `/rules` | Delete a rule |

### Default Workflow Rules (Seeded)

| Rule | Action | Condition | Auto-Approve |
|---|---|---|---|
| Auto-Refund Small Orders | refund | amount <= $50 | Yes |
| Medium Refund - Approval | refund | $50 < amount <= $200 | No |
| Auto Password Reset | password_reset | verified email | Yes |
| Large Refund - Escalation | escalate | amount > $200 | No |

## Network Restrictions (Infosys)

If AWS CLI is blocked by corporate proxy:
1. Use **AWS CloudShell** (terminal inside AWS Console browser)
2. Or configure proxy: `export HTTPS_PROXY=http://proxy:port`

## Cost Estimate

~$2-5/month total (only Bedrock costs money; all other services are within free tier).
