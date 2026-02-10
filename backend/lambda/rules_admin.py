import json
import os
import uuid
from datetime import datetime

import boto3

dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
RULES_TABLE = os.environ.get("RULES_TABLE", "SupportCopilot-Rules")

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
}


def handle_get(table):
    response = table.scan()
    items = response.get("Items", [])
    for item in items:
        for key, value in item.items():
            if isinstance(value, (int, float)):
                item[key] = str(value)
    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({"rules": items}),
    }


def handle_post(table, body):
    rule_id = str(uuid.uuid4())
    item = {
        "rule_id": rule_id,
        "rule_name": body.get("rule_name", ""),
        "action": body.get("action", ""),
        "condition": body.get("condition", ""),
        "max_amount": body.get("max_amount", 0),
        "requires_approval": body.get("requires_approval", False),
        "auto_approve": body.get("auto_approve", False),
        "active": body.get("active", True),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    table.put_item(Item=item)
    return {
        "statusCode": 201,
        "headers": CORS_HEADERS,
        "body": json.dumps({"message": "Rule created", "rule_id": rule_id}),
    }


def handle_delete(table, body):
    rule_id = body.get("rule_id")
    if not rule_id:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "rule_id is required"}),
        }
    table.delete_item(Key={"rule_id": rule_id})
    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({"message": "Rule deleted"}),
    }


def lambda_handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    table = dynamodb.Table(RULES_TABLE)
    http_method = event.get("httpMethod", "GET")

    try:
        if http_method == "GET":
            return handle_get(table)

        body = json.loads(event.get("body", "{}"))

        if http_method == "POST":
            return handle_post(table, body)

        if http_method == "DELETE":
            return handle_delete(table, body)

        return {
            "statusCode": 405,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": "Method not allowed"}),
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(e)}),
        }
