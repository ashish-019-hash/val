# GeeksGreeks - Agentic Support Copilot

**AI-driven customer support system** with Safe Actions (RAG + Workflows + Guardrails)

A GenAI support copilot that answers customer queries from your knowledge base and safely acts on accounts (refunds, resets, case updates) via controlled workflows - reducing AHT and improving CSAT without risk.

---

## Architecture Overview

```
Customer/Admin --> CloudFront --> S3 (Frontend)
                                    |
                                    v
                              API Gateway (/chat, /rules, /health)
                                    |
                    +---------------+---------------+
                    |               |               |
              ChatHandler     RulesAdmin    EscalationNotifier
              Lambda          Lambda         Lambda
                    |               |               |
              +-----+-----+   DynamoDB        SNS (Email)
              |     |     |   RulesTable
           Bedrock  |  Comprehend
           (Claude) |  (Sentiment)
                    |
              DynamoDB (Sessions, Users, Escalations)
              S3 (Knowledge Base)
```

### AWS Services Used

| Service | Purpose |
|---------|---------|
| **S3** | Host frontend (Chat + Admin UI) & knowledge base docs |
| **CloudFront** | CDN for the website |
| **Cognito** | User authentication |
| **API Gateway** | REST API endpoints |
| **Lambda** | Serverless compute (3 functions) |
| **Bedrock** | AI responses (Claude 3 Haiku) |
| **Comprehend** | Sentiment analysis |
| **DynamoDB** | Rules, Sessions, Users, Escalations tables |
| **SNS** | Escalation email notifications |
| **CloudWatch** | Logs & monitoring |

---

## Complete Step-by-Step Deployment Guide (For AWS Beginners)

### Prerequisites

Before you start, you need to set up a few things on your computer.

---

### STEP 1: Create an AWS Account

1. Go to [https://aws.amazon.com](https://aws.amazon.com)
2. Click **"Create an AWS Account"** (top right)
3. Enter your email, set a password, and choose an account name
4. Enter your payment information (AWS has a free tier - most services we use are free for 12 months)
5. Verify your identity (phone verification)
6. Choose the **"Basic Support - Free"** plan
7. Sign in to the AWS Console at [https://console.aws.amazon.com](https://console.aws.amazon.com)

---

### STEP 2: Create an IAM User (Recommended for Security)

Instead of using your root account, create an IAM user:

1. Go to **AWS Console** > Search for **"IAM"** > Click on IAM
2. In the left sidebar, click **"Users"**
3. Click **"Create user"**
4. Enter a username (e.g., `geeksgreeks-admin`)
5. Check **"Provide user access to the AWS Management Console"**
6. Choose **"I want to create an IAM user"**
7. Set a console password
8. Click **"Next"**
9. Select **"Attach policies directly"**
10. Search and check these policies:
    - `AdministratorAccess` (for hackathon simplicity - restrict in production)
11. Click **"Next"** > **"Create user"**
12. Save the sign-in URL, username, and password

---

### STEP 3: Install AWS CLI on Your Computer

**For Windows:**
1. Download the installer: [https://awscli.amazonaws.com/AWSCLIV2.msi](https://awscli.amazonaws.com/AWSCLIV2.msi)
2. Run the downloaded `.msi` file
3. Click through the installer (Next > Next > Install)
4. Open **Command Prompt** (search "cmd" in Start Menu)
5. Type `aws --version` to verify installation

**For Mac:**
```bash
# Open Terminal and run:
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
aws --version
```

**For Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version
```

---

### STEP 4: Configure AWS CLI with Your Credentials

1. Go to **AWS Console** > **IAM** > **Users** > Click your user
2. Go to **"Security credentials"** tab
3. Under "Access keys", click **"Create access key"**
4. Select **"Command Line Interface (CLI)"**
5. Check the acknowledgment box > Click **"Next"** > **"Create access key"**
6. **IMPORTANT**: Save the **Access Key ID** and **Secret Access Key** (you can't see the secret again!)

Now configure the CLI:
```bash
aws configure
```
It will ask you 4 things:
```
AWS Access Key ID: [paste your access key]
AWS Secret Access Key: [paste your secret key]
Default region name: us-east-1
Default output format: json
```

Test it works:
```bash
aws sts get-caller-identity
```
You should see your account ID and user info.

---

### STEP 5: Install AWS SAM CLI

SAM (Serverless Application Model) makes deploying Lambda functions easy.

**For Windows:**
1. Download: [https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi](https://github.com/aws/aws-sam-cli/releases/latest/download/AWS_SAM_CLI_64_PY3.msi)
2. Run the installer
3. Open a new Command Prompt
4. Type `sam --version` to verify

**For Mac:**
```bash
brew install aws-sam-cli
sam --version
```

**For Linux:**
```bash
pip install aws-sam-cli
sam --version
```

---

### STEP 6: Install Docker (Required for SAM Build)

SAM uses Docker to build Lambda functions.

1. Go to [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
2. Download Docker Desktop for your OS
3. Install and start Docker Desktop
4. Verify: `docker --version`

---

### STEP 7: Install Python 3.12+

**For Windows:**
1. Go to [https://www.python.org/downloads/](https://www.python.org/downloads/)
2. Download Python 3.12
3. Run installer - **CHECK "Add Python to PATH"**
4. Verify: `python --version`

**For Mac/Linux:**
```bash
# Check if already installed
python3 --version
# If not, install via brew (Mac) or apt (Linux)
brew install python@3.12   # Mac
sudo apt install python3.12 # Linux
```

---

### STEP 8: Enable Amazon Bedrock Model Access

This is required for the AI chat to work:

1. Go to **AWS Console** > Search for **"Bedrock"**
2. Click **"Amazon Bedrock"**
3. In the left sidebar, click **"Model access"** (under "Bedrock configurations")
4. Click **"Manage model access"** (top right)
5. Find **"Anthropic"** > Check **"Claude 3 Haiku"**
6. Click **"Request model access"** at the bottom
7. Wait for approval (usually instant, sometimes takes a few minutes)
8. Status should change to **"Access granted"**

---

### STEP 9: Clone This Repository

```bash
# Open your terminal/command prompt
git clone https://github.com/ashish-019-hash/val.git geeksgreeks-copilot
cd geeksgreeks-copilot

# Switch to the project branch
git checkout devin/1770712511-geeksgreeks-copilot
```

---

### STEP 10: Deploy the Application

**Option A: Automatic deployment (recommended)**

```bash
# Make the deploy script executable (Mac/Linux only)
chmod +x scripts/deploy.sh

# Run the deployment (replace with your email)
./scripts/deploy.sh dev us-east-1 your-email@example.com
```

**Option B: Manual step-by-step deployment**

```bash
# Step 10a: Validate the template
sam validate --template template.yaml --region us-east-1

# Step 10b: Build the Lambda functions
sam build --template template.yaml --use-container

# Step 10c: Deploy (first time will take ~10 minutes)
sam deploy \
    --stack-name geeksgreeks-copilot-dev \
    --region us-east-1 \
    --parameter-overrides "Stage=dev AdminEmail=your-email@example.com" \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --resolve-s3 \
    --no-confirm-changeset

# Step 10d: Get the deployment outputs
aws cloudformation describe-stacks \
    --stack-name geeksgreeks-copilot-dev \
    --region us-east-1 \
    --query "Stacks[0].Outputs" \
    --output table
```

Save the outputs! You'll need:
- **ApiUrl** - Your API endpoint
- **CloudFrontUrl** - Your website URL
- **UserPoolId** - For authentication setup
- **UserPoolClientId** - For authentication setup
- **FrontendBucketName** - For uploading the website

---

### STEP 11: Upload the Frontend

```bash
# Get the frontend bucket name from Step 10 outputs
FRONTEND_BUCKET="geeksgreeks-frontend-dev-YOUR_ACCOUNT_ID"

# Upload frontend files
aws s3 sync frontend/ s3://$FRONTEND_BUCKET/ --delete --region us-east-1
```

---

### STEP 12: Upload Knowledge Base Documents

```bash
# Get the knowledge base bucket name from Step 10 outputs
KB_BUCKET="geeksgreeks-knowledge-base-dev-YOUR_ACCOUNT_ID"

# Upload knowledge base files
aws s3 sync knowledge_base/ s3://$KB_BUCKET/knowledge/ --region us-east-1
```

---

### STEP 13: Seed the Database with Sample Data

```bash
# Install boto3 if not already installed
pip install boto3

# Run the seed script
python3 scripts/seed_data.py dev us-east-1
```

---

### STEP 14: Create Your First User in Cognito

```bash
# Replace with your actual User Pool ID from Step 10
USER_POOL_ID="us-east-1_XXXXXXXXX"

# Create a user
aws cognito-idp admin-create-user \
    --user-pool-id $USER_POOL_ID \
    --username user@example.com \
    --user-attributes Name=email,Value=user@example.com Name=name,Value="Test User" \
    --temporary-password "TempPass123!" \
    --region us-east-1

# Set a permanent password (so you don't have to change it on first login)
aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username user@example.com \
    --password "MyPassword123!" \
    --permanent \
    --region us-east-1

# Create an admin user
aws cognito-idp admin-create-user \
    --user-pool-id $USER_POOL_ID \
    --username admin@example.com \
    --user-attributes Name=email,Value=admin@example.com Name=name,Value="Admin User" Name=custom:role,Value=admin \
    --temporary-password "TempPass123!" \
    --region us-east-1

aws cognito-idp admin-set-user-password \
    --user-pool-id $USER_POOL_ID \
    --username admin@example.com \
    --password "AdminPass123!" \
    --permanent \
    --region us-east-1
```

---

### STEP 15: Access Your Application

1. Open the **CloudFront URL** from Step 10 in your browser
2. On the setup screen, enter:
   - **API Gateway URL**: The ApiUrl from Step 10
   - **Cognito User Pool ID**: The UserPoolId from Step 10
   - **Cognito App Client ID**: The UserPoolClientId from Step 10
   - **AWS Region**: `us-east-1`
3. Click **"Save & Continue"**
4. Log in with the credentials you created in Step 14
5. Start chatting with the AI support copilot!

**Or try Demo Mode:**
- Click **"Skip setup (demo mode)"** to try the UI without AWS backend

---

### STEP 16: Confirm Escalation Email Notifications

1. Check the email you provided as `AdminEmail` during deployment
2. You'll receive an email from AWS SNS asking you to confirm subscription
3. Click **"Confirm subscription"** in the email
4. Now you'll receive email notifications whenever an escalation is created

---

## Features

### Chat UI (Customer-facing)
- Real-time AI-powered chat
- Sentiment analysis on every message
- Automatic intent detection (refund, password reset, escalation, etc.)
- Safe action execution with guardrails
- Conversation history per session

### Admin Panel
- View and manage support rules
- Create, edit, delete rules with keywords, responses, and actions
- View escalation queue with priority levels
- Resolve escalations with notes
- Dashboard with key metrics

### Safe Actions (Guardrails)
| Action | Auto-Approved | Limits |
|--------|--------------|--------|
| Refund | Yes | Up to $100 |
| Password Reset | Yes | No limit |
| Update Case | Yes | No limit |
| Account Credit | Yes | Up to $50 |
| Escalate to Agent | Yes | No limit |
| Cancel Subscription | No | Requires approval |

Actions exceeding limits are automatically escalated to supervisors.

---

## Project Structure

```
geeksgreeks-copilot/
├── template.yaml              # SAM/CloudFormation infrastructure template
├── samconfig.toml             # SAM deployment configuration
├── README.md                  # This file (deployment guide)
├── frontend/                  # Web application
│   ├── index.html             # Chat UI page
│   ├── admin.html             # Admin panel page
│   ├── css/styles.css         # Styling
│   └── js/
│       ├── auth.js            # Cognito authentication
│       ├── app.js             # Chat UI logic
│       └── admin.js           # Admin panel logic
├── backend/                   # Lambda functions
│   ├── chat_handler/          # Main chatbot brain
│   │   ├── app.py
│   │   └── requirements.txt
│   ├── rules_admin/           # Admin rules management
│   │   ├── app.py
│   │   └── requirements.txt
│   └── escalation_notifier/   # SNS notification sender
│       ├── app.py
│       └── requirements.txt
├── knowledge_base/            # FAQ and support documents
│   └── sample_faqs.json
├── seed_data/                 # Initial database data
│   ├── seed_rules.json        # Sample support rules
│   └── seed_users.json        # Sample users
└── scripts/                   # Deployment helpers
    ├── deploy.sh              # One-click deploy script
    └── seed_data.py           # Database seeder
```

---

## Cleanup (Remove All Resources)

When you're done with the hackathon, delete everything to avoid charges:

```bash
# Empty the S3 buckets first (required before deletion)
FRONTEND_BUCKET="geeksgreeks-frontend-dev-YOUR_ACCOUNT_ID"
KB_BUCKET="geeksgreeks-knowledge-base-dev-YOUR_ACCOUNT_ID"

aws s3 rm s3://$FRONTEND_BUCKET --recursive
aws s3 rm s3://$KB_BUCKET --recursive

# Delete the entire CloudFormation stack
aws cloudformation delete-stack \
    --stack-name geeksgreeks-copilot-dev \
    --region us-east-1

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete \
    --stack-name geeksgreeks-copilot-dev \
    --region us-east-1

echo "All resources deleted!"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `sam build` fails | Make sure Docker is running |
| Bedrock returns error | Ensure you enabled model access (Step 8) |
| CORS errors in browser | Check API Gateway CORS settings in template.yaml |
| CloudFront shows old content | Wait 5 min or create an invalidation: `aws cloudfront create-invalidation --distribution-id XXXXX --paths "/*"` |
| Login fails | Verify Cognito User Pool ID and Client ID in setup screen |
| 403 on API calls | Check that the Cognito token is being sent in Authorization header |

---

## Cost Estimate (Hackathon/Demo Usage)

For low usage during a hackathon, most costs fall under AWS Free Tier:

| Service | Free Tier | Estimated Cost |
|---------|-----------|---------------|
| Lambda | 1M requests/month free | $0 |
| DynamoDB | 25 GB + 25 WCU/RCU free | $0 |
| S3 | 5 GB free | $0 |
| CloudFront | 1 TB/month free | $0 |
| API Gateway | 1M calls/month free | $0 |
| Cognito | 50K MAU free | $0 |
| Bedrock (Claude) | Pay per token | ~$0.25/1000 queries |
| Comprehend | 50K units/month free | $0 |
| SNS | 1M publishes free | $0 |

**Estimated total for hackathon demo: < $5**

---

## Team

**GeeksGreeks** - Hackathon Team
- Domain: Customer Experience & Support
- AWS Stack: API Gateway, Lambda, Bedrock, Comprehend, DynamoDB, S3, CloudFront, Cognito, SNS
