from app.core.database import get_content_db
db = get_content_db()

print('Checking L2 nodes for children discrepancy...')
# Get 50 L2 nodes to be sure
l2_nodes = db.table('curriculum').select('id, title, has_children').eq('year_level', '10').eq('level', 2).limit(50).execute()

discrepancy_count = 0
checked_count = 0

for node in l2_nodes.data:
    children_res = db.table('curriculum').select('id', count='exact').eq('parent_id', node['id']).execute()
    count = children_res.count
    checked_count += 1
    
    status = "OK"
    if count > 0 and not node['has_children']:
        status = "MISMATCH (Should be True)"
        discrepancy_count += 1
        print(f"L2 Node: {node['title']} | has_children={node['has_children']} | Actual Children: {count} -> {status}")
    elif count == 0 and node['has_children']:
        status = "MISMATCH (Should be False)"
        discrepancy_count += 1
        print(f"L2 Node: {node['title']} | has_children={node['has_children']} | Actual Children: {count} -> {status}")
        
    # Only print mismatches to avoid clutter, unless everything is OK
    
if discrepancy_count == 0:
    print(f"Checked {checked_count} nodes. ALL OK.")
else:
    print(f"\nFound {discrepancy_count} discrepancies out of {checked_count} L2 nodes.")
    print("These nodes have children (notes) but are marked as leaf nodes, preventing expansion.")
