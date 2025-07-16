import json

def clean_json_file(file_path):
    # Read the JSON file
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Create a new list with cleaned entries
    cleaned_data = []
    for entry in data:
        # Create a new dictionary with consistent field order
        cleaned_entry = {
            "_id": entry.get("_id", ""),
            "Company Name": entry.get("Company Name", ""),
            "EmailID": entry.get("EmailID", ""),
            "created_at": entry.get("created_at", ""),
            "created_by": entry.get("created_by", "")
        }
        cleaned_data.append(cleaned_entry)
    
    # Write the cleaned data back to the file with consistent indentation
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_data, f, indent=4, ensure_ascii=False)
        f.write('\n')  # Add newline at end of file

if __name__ == "__main__":
    clean_json_file('static/data/c.json')
    print("JSON file has been cleaned and formatted.")
