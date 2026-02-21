from app.core.database import get_content_db

db = get_content_db()

print("\n--- DEBUGGING ID OVERLAP (v2) ---")

# 1. Get ALL unique curriculum_ids from base_content
# Only select what we know exists: curriculum_id, maybe title
print("Fetching base_content curriculum_ids...")
content_res = db.table("base_content").select("curriculum_id, content_json").limit(50).execute()

# Use set comprehension to get unique IDs
content_ids = {row['curriculum_id'] for row in content_res.data if row.get('curriculum_id')}
print(f"Found {len(content_ids)} unique curriculum IDs in base_content (from sample of 50).")

if not content_ids:
    print("❌ No valid curriculum_ids found in base_content!")
    exit()

# 2. Check if these IDs exist in curriculum table
print(f"\nChecking sample of {min(5, len(content_ids))} IDs against curriculum table...")

match_count = 0
for cid in list(content_ids)[:5]:
    try:
        # Check against curriculum table
        curr_res = db.table("curriculum").select("id, code, title").eq("id", cid).execute()
        
        if curr_res.data:
            match_count += 1
            node = curr_res.data[0]
            print(f"✅ MATCH FOUND for ID: {cid}")
            print(f"   -> Node: {node['title']} (Code: {node['code']})")
        else:
            print(f"❌ ORPHANED ID: {cid}")
            print("   (Data exists in base_content but NO matching curriculum node found!)")
            
    except Exception as e:
        print(f"⚠️ Error checking ID {cid}: {e}")

print("\n--- SUMMARY ---")
if match_count > 0:
    print(f"✅ FOUND {match_count} VALID MATCHES.")
    print("This confirms the relationship works for some nodes.")
    print("The issue might be user interface mismatch (clicking wrong node).")
else:
    print("❌ NO MATCHES FOUND.")
    print("This means base_content IDs point to non-existent curriculum nodes.")
