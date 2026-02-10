#!/usr/bin/env python3
"""Seed DynamoDB tables with sample data for GeeksGreeks Support Copilot."""

import json
import sys

import boto3


def seed_table(table_name, data_file, key_field, region="us-east-1"):
    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)

    with open(data_file, "r") as f:
        items = json.load(f)

    print(f"Seeding {table_name} with {len(items)} items...")

    for item in items:
        table.put_item(Item=item)
        print(f"  Added: {item.get(key_field, 'unknown')}")

    print(f"Done! {len(items)} items added to {table_name}.")
    print()


def main():
    stage = sys.argv[1] if len(sys.argv) > 1 else "dev"
    region = sys.argv[2] if len(sys.argv) > 2 else "us-east-1"

    print(f"Seeding data for stage: {stage}, region: {region}")
    print("=" * 50)
    print()

    seed_table(
        f"geeksgreeks-rules-{stage}",
        "seed_data/seed_rules.json",
        "ruleId",
        region,
    )

    seed_table(
        f"geeksgreeks-users-{stage}",
        "seed_data/seed_users.json",
        "userId",
        region,
    )

    print("All seed data loaded successfully!")


if __name__ == "__main__":
    main()
