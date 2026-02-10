import json
import os
import uuid
import time
import logging

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")

RULES_TABLE = os.environ.get("RULES_TABLE", "geeksgreeks-rules-dev")
ESCALATIONS_TABLE = os.environ.get("ESCALATIONS_TABLE", "geeksgreeks-escalations-dev")


def build_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body, default=str),
    }


def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    http_method = event.get("httpMethod", "")
    path = event.get("path", "")
    path_params = event.get("pathParameters") or {}

    if http_method == "OPTIONS":
        return build_response(200, {"message": "OK"})

    if "/escalations" in path:
        if http_method == "GET":
            return get_escalations(event)
        elif http_method == "PUT":
            return update_escalation(event, path_params.get("escalationId"))
        return build_response(405, {"error": "Method not allowed"})

    if "/rules" in path:
        if http_method == "GET":
            return get_rules(event)
        elif http_method == "POST":
            return create_rule(event)
        elif http_method == "PUT":
            return update_rule(event, path_params.get("ruleId"))
        elif http_method == "DELETE":
            return delete_rule(event, path_params.get("ruleId"))

    return build_response(404, {"error": "Not found"})


def get_rules(event):
    table = dynamodb.Table(RULES_TABLE)
    params = event.get("queryStringParameters") or {}
    category = params.get("category")

    try:
        if category:
            response = table.query(
                IndexName="category-index",
                KeyConditionExpression=boto3.dynamodb.conditions.Key("category").eq(category),
            )
        else:
            response = table.scan()

        rules = response.get("Items", [])
        return build_response(200, {"rules": rules, "count": len(rules)})
    except ClientError as e:
        logger.error("Error fetching rules: %s", e)
        return build_response(500, {"error": "Failed to fetch rules"})


def create_rule(event):
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return build_response(400, {"error": "Invalid JSON body"})

    required_fields = ["name", "category", "keywords", "response"]
    missing = [f for f in required_fields if not body.get(f)]
    if missing:
        return build_response(400, {"error": f"Missing required fields: {', '.join(missing)}"})

    rule_id = str(uuid.uuid4())
    rule = {
        "ruleId": rule_id,
        "name": body["name"],
        "category": body["category"],
        "keywords": body["keywords"],
        "response": body["response"],
        "action": body.get("action"),
        "priority": body.get("priority", "medium"),
        "isActive": body.get("isActive", True),
        "createdAt": int(time.time()),
        "updatedAt": int(time.time()),
        "createdBy": extract_user_id(event),
    }

    table = dynamodb.Table(RULES_TABLE)
    try:
        table.put_item(Item=rule)
        return build_response(201, {"message": "Rule created", "rule": rule})
    except ClientError as e:
        logger.error("Error creating rule: %s", e)
        return build_response(500, {"error": "Failed to create rule"})


def update_rule(event, rule_id):
    if not rule_id:
        return build_response(400, {"error": "Rule ID is required"})

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return build_response(400, {"error": "Invalid JSON body"})

    table = dynamodb.Table(RULES_TABLE)
    update_fields = {}
    for field in ["name", "category", "keywords", "response", "action", "priority", "isActive"]:
        if field in body:
            update_fields[field] = body[field]

    if not update_fields:
        return build_response(400, {"error": "No fields to update"})

    update_fields["updatedAt"] = int(time.time())
    update_fields["updatedBy"] = extract_user_id(event)

    update_expr_parts = []
    expr_attr_values = {}
    expr_attr_names = {}

    for key, value in update_fields.items():
        placeholder = f":val_{key}"
        name_placeholder = f"#attr_{key}"
        update_expr_parts.append(f"{name_placeholder} = {placeholder}")
        expr_attr_values[placeholder] = value
        expr_attr_names[name_placeholder] = key

    update_expression = "SET " + ", ".join(update_expr_parts)

    try:
        response = table.update_item(
            Key={"ruleId": rule_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expr_attr_values,
            ExpressionAttributeNames=expr_attr_names,
            ReturnValues="ALL_NEW",
        )
        return build_response(200, {"message": "Rule updated", "rule": response["Attributes"]})
    except ClientError as e:
        logger.error("Error updating rule: %s", e)
        return build_response(500, {"error": "Failed to update rule"})


def delete_rule(event, rule_id):
    if not rule_id:
        return build_response(400, {"error": "Rule ID is required"})

    table = dynamodb.Table(RULES_TABLE)
    try:
        table.delete_item(Key={"ruleId": rule_id})
        return build_response(200, {"message": f"Rule {rule_id} deleted"})
    except ClientError as e:
        logger.error("Error deleting rule: %s", e)
        return build_response(500, {"error": "Failed to delete rule"})


def get_escalations(event):
    table = dynamodb.Table(ESCALATIONS_TABLE)
    params = event.get("queryStringParameters") or {}
    status_filter = params.get("status")

    try:
        if status_filter:
            response = table.query(
                IndexName="status-index",
                KeyConditionExpression=boto3.dynamodb.conditions.Key("status").eq(status_filter),
            )
        else:
            response = table.scan()

        escalations = response.get("Items", [])
        escalations.sort(key=lambda x: x.get("createdAt", 0), reverse=True)
        return build_response(200, {"escalations": escalations, "count": len(escalations)})
    except ClientError as e:
        logger.error("Error fetching escalations: %s", e)
        return build_response(500, {"error": "Failed to fetch escalations"})


def update_escalation(event, escalation_id):
    if not escalation_id:
        return build_response(400, {"error": "Escalation ID is required"})

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return build_response(400, {"error": "Invalid JSON body"})

    table = dynamodb.Table(ESCALATIONS_TABLE)
    new_status = body.get("status")
    resolution = body.get("resolution", "")

    if not new_status:
        return build_response(400, {"error": "Status is required"})

    valid_statuses = ["open", "in_progress", "resolved", "closed"]
    if new_status not in valid_statuses:
        return build_response(400, {"error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"})

    try:
        response = table.update_item(
            Key={"escalationId": escalation_id},
            UpdateExpression="SET #s = :status, resolution = :resolution, updatedAt = :now, resolvedBy = :user",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":status": new_status,
                ":resolution": resolution,
                ":now": int(time.time()),
                ":user": extract_user_id(event),
            },
            ReturnValues="ALL_NEW",
        )
        return build_response(200, {"message": "Escalation updated", "escalation": response["Attributes"]})
    except ClientError as e:
        logger.error("Error updating escalation: %s", e)
        return build_response(500, {"error": "Failed to update escalation"})


def extract_user_id(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )
    return claims.get("sub", claims.get("cognito:username", "anonymous"))
