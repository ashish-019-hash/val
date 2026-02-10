import json
import os
import uuid
from datetime import datetime

import boto3

bedrock_runtime = boto3.client("bedrock-runtime", region_name="us-east-1")
dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
s3 = boto3.client("s3", region_name="us-east-1")

SESSIONS_TABLE = os.environ.get("SESSIONS_TABLE", "SupportCopilot-Sessions")
RULES_TABLE = os.environ.get("RULES_TABLE", "SupportCopilot-Rules")
ESCALATIONS_TABLE = os.environ.get("ESCALATIONS_TABLE", "SupportCopilot-Escalations")
KNOWLEDGE_BUCKET = os.environ.get("KNOWLEDGE_BUCKET", "support-copilot-knowledge-base")
MODEL_ID = os.environ.get("MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

ESCALATION_PHRASES = [
    "talk to agent",
    "human agent",
    "escalate",
    "speak to someone",
    "manager",
    "real person",
    "live agent",
]


def get_knowledge_base_context():
    try:
        context_parts = []
        response = s3.list_objects_v2(Bucket=KNOWLEDGE_BUCKET, Prefix="")
        if "Contents" in response:
            for obj in response["Contents"]:
                if obj["Key"].endswith((".txt", ".md")):
                    file_obj = s3.get_object(Bucket=KNOWLEDGE_BUCKET, Key=obj["Key"])
                    content = file_obj["Body"].read().decode("utf-8")
                    context_parts.append(f"--- {obj['Key']} ---\n{content}")
        return "\n\n".join(context_parts)
    except Exception as e:
        print(f"Error fetching knowledge base: {e}")
        return ""


def get_workflow_rules():
    try:
        table = dynamodb.Table(RULES_TABLE)
        response = table.scan()
        rules = response.get("Items", [])
        rules_text = ""
        for rule in rules:
            rules_text += f"\nRule: {rule.get('rule_name', 'N/A')}\n"
            rules_text += f"  Action: {rule.get('action', 'N/A')}\n"
            rules_text += f"  Condition: {rule.get('condition', 'N/A')}\n"
            rules_text += f"  Max Amount: {rule.get('max_amount', 'N/A')}\n"
            rules_text += f"  Requires Approval: {rule.get('requires_approval', 'N/A')}\n"
        return rules_text
    except Exception as e:
        print(f"Error fetching rules: {e}")
        return ""


def get_session_history(session_id):
    try:
        table = dynamodb.Table(SESSIONS_TABLE)
        response = table.get_item(Key={"session_id": session_id})
        if "Item" in response:
            return response["Item"].get("messages", [])
        return []
    except Exception as e:
        print(f"Error fetching session: {e}")
        return []


def save_session(session_id, messages, user_id="anonymous"):
    try:
        table = dynamodb.Table(SESSIONS_TABLE)
        table.put_item(
            Item={
                "session_id": session_id,
                "user_id": user_id,
                "messages": messages,
                "updated_at": datetime.utcnow().isoformat(),
                "created_at": datetime.utcnow().isoformat(),
            }
        )
    except Exception as e:
        print(f"Error saving session: {e}")


def create_escalation(session_id, user_id, reason, message):
    try:
        table = dynamodb.Table(ESCALATIONS_TABLE)
        escalation_id = str(uuid.uuid4())
        table.put_item(
            Item={
                "escalation_id": escalation_id,
                "session_id": session_id,
                "user_id": user_id,
                "reason": reason,
                "original_message": message,
                "status": "open",
                "created_at": datetime.utcnow().isoformat(),
            }
        )
        return escalation_id
    except Exception as e:
        print(f"Error creating escalation: {e}")
        return None


def build_system_prompt(knowledge_context, workflow_rules):
    return f"""You are an AI-powered customer support copilot for an e-commerce company.
Your role is to help customers with their queries using the knowledge base and follow strict workflow rules.

KNOWLEDGE BASE:
{knowledge_context}

WORKFLOW RULES & GUARDRAILS:
{workflow_rules}

INSTRUCTIONS:
1. Answer customer queries using ONLY the knowledge base information above.
2. If a customer asks for an ACTION (refund, password reset, order cancellation):
   - Check the workflow rules to determine if you can auto-approve
   - If auto-approve: Confirm the action and provide details
   - If approval needed: Inform the customer it requires approval and will be escalated
   - Always state what guardrails apply (e.g., "refund within 30 days", "max $50 auto-approve")
3. If the customer seems frustrated (negative sentiment), be extra empathetic and offer escalation
4. If the customer asks to "talk to agent" or you cannot help, create an escalation
5. Always be professional, concise, and helpful
6. If you don't know the answer, say so honestly and offer to escalate

RESPONSE FORMAT:
- Be conversational but professional
- Include relevant policy details when performing actions
- Mention any guardrails that apply
- If an action was taken, confirm it clearly

DETECT INTENT from the message and respond accordingly:
- QUERY: Answer from knowledge base
- REFUND: Follow refund workflow rules
- PASSWORD_RESET: Follow password reset process
- ORDER_TRACKING: Provide tracking guidance
- ESCALATION: Create escalation to human agent
- GENERAL: General conversation"""


def call_bedrock(messages, system_prompt):
    try:
        body = json.dumps(
            {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1024,
                "system": system_prompt,
                "messages": messages,
            }
        )
        response = bedrock_runtime.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )
        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]
    except Exception as e:
        print(f"Error calling Bedrock: {e}")
        return (
            "I apologize, but I'm experiencing technical difficulties. "
            "Please try again or type 'talk to agent' to reach a human representative."
        )


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        body = json.loads(event.get("body", "{}"))
        user_message = body.get("message", "").strip()
        session_id = body.get("session_id", str(uuid.uuid4()))
        user_id = body.get("user_id", "anonymous")

        if not user_message:
            return {
                "statusCode": 400,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "Message is required"}),
            }

        knowledge_context = get_knowledge_base_context()
        workflow_rules = get_workflow_rules()
        history = get_session_history(session_id)
        system_prompt = build_system_prompt(knowledge_context, workflow_rules)

        messages_for_bedrock = []
        for msg in history[-10:]:
            messages_for_bedrock.append(
                {
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                }
            )
        messages_for_bedrock.append({"role": "user", "content": user_message})

        ai_response = call_bedrock(messages_for_bedrock, system_prompt)

        escalation_id = None
        needs_escalation = any(
            phrase in user_message.lower() for phrase in ESCALATION_PHRASES
        )
        if needs_escalation:
            escalation_id = create_escalation(
                session_id, user_id, "Customer requested human agent", user_message
            )

        history.append(
            {
                "role": "user",
                "content": user_message,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
        history.append(
            {
                "role": "assistant",
                "content": ai_response,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
        save_session(session_id, history, user_id)

        response_body = {
            "response": ai_response,
            "session_id": session_id,
            "escalation_id": escalation_id,
            "escalated": needs_escalation,
        }

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps(response_body),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Internal server error", "details": str(e)}),
        }
