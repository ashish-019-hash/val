import json
import os
import logging

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sns = boto3.client("sns")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")


def lambda_handler(event, context):
    logger.info("DynamoDB Stream event: %s", json.dumps(event))

    for record in event.get("Records", []):
        if record.get("eventName") != "INSERT":
            continue

        new_image = record.get("dynamodb", {}).get("NewImage", {})
        if not new_image:
            continue

        escalation = deserialize_dynamodb(new_image)
        send_notification(escalation)


def deserialize_dynamodb(dynamodb_item):
    result = {}
    for key, value in dynamodb_item.items():
        if "S" in value:
            result[key] = value["S"]
        elif "N" in value:
            result[key] = value["N"]
        elif "BOOL" in value:
            result[key] = value["BOOL"]
        elif "L" in value:
            result[key] = [deserialize_dynamodb_value(v) for v in value["L"]]
        elif "M" in value:
            result[key] = deserialize_dynamodb(value["M"])
    return result


def deserialize_dynamodb_value(value):
    if "S" in value:
        return value["S"]
    if "N" in value:
        return value["N"]
    if "BOOL" in value:
        return value["BOOL"]
    return str(value)


def send_notification(escalation):
    if not SNS_TOPIC_ARN:
        logger.warning("SNS_TOPIC_ARN not configured, skipping notification")
        return

    escalation_id = escalation.get("escalationId", "unknown")
    user_id = escalation.get("userId", "unknown")
    reason = escalation.get("reason", "No reason provided")
    message_text = escalation.get("message", "No message")
    priority = escalation.get("priority", "medium")

    subject = f"[GeeksGreeks] New Escalation - Priority: {priority.upper()}"

    body = f"""
New Support Escalation Created
==============================

Escalation ID: {escalation_id}
Customer ID:   {user_id}
Priority:      {priority.upper()}
Reason:        {reason}

Customer Message:
{message_text}

-------------------------------
Please review this escalation in the GeeksGreeks Admin Panel.
"""

    try:
        sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject[:100],
            Message=body,
            MessageAttributes={
                "priority": {
                    "DataType": "String",
                    "StringValue": priority,
                },
            },
        )
        logger.info("Notification sent for escalation %s", escalation_id)
    except ClientError as e:
        logger.error("Failed to send notification: %s", e)
