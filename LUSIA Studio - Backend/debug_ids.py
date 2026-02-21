from app.core.database import get_content_db

db = get_content_db()

print("\n--- DEBUGGING ID OVERLAP ---")

# 1. Get ALL curriculum_ids from base_content
print("Fetching base_content curriculum_ids...")
content_res = db.table("base_content").select("curriculum_id, curriculum_code, title").limit(50).execute()
content_ids = {row['curriculum_id'] for row in content_res.data}
print(f"Found {len(content_ids)} unique curriculum IDs in base_content.")

# 2. Get ALL ids from curriculum that MATCH these
if not content_ids:
    print("No content found to match against.")
    exit()
    
print(f"\nChecking if these {len(content_ids)} IDs exist in curriculum table...")
# UUIDs must be strings in the query
id_list = list(content_ids)
# We can't query all at once easily with 'in', so let's just check the first 5
sample_ids = id_list[:5]
print(f"checking sample: {sample_ids}")

matches = []
for cid in sample_ids:
    res = db.table("curriculum").select("id, code, title").eq("id", cid).execute()
    if res.data:
        matches.append(res.data[0])
        print(f"✅ MATCH FOUND: ID {cid}")
        print(f"   Note Title: {[r['title'] for r in content_res.data if r['curriculum_id'] == cid][0]}")
        print(f"   Curriculum Node: {res.data[0]['title']} ({res.data[0]['code']})")
    else:
        print(f"❌ ORPHANED CONTENT: ID {cid} exists in base_content but NOT in curriculum table.")

print("\n--- SUMMARY ---")
print(f"Checked {len(sample_ids)} sample IDs from base_content.")
print(f"Found {len(matches)} valid matches in curriculum.")
