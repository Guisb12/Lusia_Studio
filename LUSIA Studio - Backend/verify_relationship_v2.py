from app.core.database import get_content_db
import json

db = get_content_db()

print("--- VERIFYING DATA RELATIONSHIP ---")

# 1. Get a curriculum node that SHOULD have content (e.g. Economia A 10.1.1.1)
# Note: I'm searching by title/code pattern to find a valid node
print("\n1. Searching for 'Economia A' curriculum node...")
# Search for something deeper like 1.1.1
node_query = db.table("curriculum").select("id, code, title, has_children").ilike("code", "%econ_a_10_1_1_1").limit(1).execute()

if not node_query.data:
    print("❌ No 'Economia' curriculum node found!")
    exit()

node = node_query.data[0]
print(f"✅ Found Node: {node['title']} (Code: {node['code']})")
print(f"   ID: {node['id']}")

# 2. Query base_content using THAT ID
print(f"\n2. Querying base_content with curriculum_id = {node['id']}...")
note_query = db.table("base_content").select("id, curriculum_id, title").eq("curriculum_id", node['id']).execute()

if note_query.data:
    note = note_query.data[0]
    print(f"✅ FOUND NOTE!")
    print(f"   Note ID: {note['id']}")
    print(f"   Linked Curriculum ID: {note['curriculum_id']}")
else:
    print("❌ NO NOTE FOUND for this curriculum ID.")
    print("   This confirms query logic is correct (by ID), but data is missing.")
