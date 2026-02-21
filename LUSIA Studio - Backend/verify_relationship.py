from app.core.database import get_content_db
import json

db = get_content_db()

print("--- VERIFYING DATA RELATIONSHIP ---")

# 1. Get a curriculum node that SHOULD have content (e.g. Economia A 10.1.1.1)
# Note: I'm searching by title/code pattern to find a valid node
print("\n1. Searching for 'Economia A' curriculum node...")
node_query = db.table("curriculum").select("id, code, title, has_children").ilike("title", "%Economia%").eq("year_level", "10").limit(1).execute()

if not node_query.data:
    print("❌ No 'Economia' curriculum node found!")
    exit()

node = node_query.data[0]
print(f"✅ Found Node: {node['title']} (Code: {node['code']})")
print(f"   ID: {node['id']}")

# 2. Query base_content using THAT ID
print(f"\n2. Querying base_content with curriculum_id = {node['id']}...")
note_query = db.table("base_content").select("id, curriculum_id, curriculum_code, title").eq("curriculum_id", node['id']).execute()

if note_query.data:
    note = note_query.data[0]
    print(f"✅ FOUND NOTE!")
    print(f"   Note ID: {note['id']}")
    print(f"   Linked Curriculum ID: {note['curriculum_id']}")
    print(f"   Linked Curriculum Code: {note['curriculum_code']}")
else:
    print("❌ NO NOTE FOUND for this curriculum ID.")
    
    # 3. Debug: Check if there are ANY notes for similar codes
    print("\n3. Debugging: Do any notes exist for similar codes?")
    base_code = node['code'].rsplit('_', 1)[0] # Remove last part
    debug_query = db.table("base_content").select("id, curriculum_id, curriculum_code").ilike("curriculum_code", f"{base_code}%").limit(3).execute()
    
    if debug_query.data:
        print("   Found these ORPHANED notes (IDs don't match?):")
        for n in debug_query.data:
            print(f"   - Note for code '{n['curriculum_code']}' has curriculum_id: {n['curriculum_id']}")
            if n['curriculum_id'] == node['id']:
                print("     (Wait, ID matches! Why didn't strict query work?)")
            else:
                print(f"     (MISMATCH: Expected {node['id']} != Found {n['curriculum_id']})")
    else:
        print("   No similar notes found either.")
