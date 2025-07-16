# Read the JSON file
$jsonPath = 'static\data\c.json'
$jsonContent = Get-Content $jsonPath -Raw | ConvertFrom-Json

# Create a new array for cleaned entries
$cleanedData = @()

foreach ($entry in $jsonContent) {
    # Create a new ordered dictionary for consistent field order
    $cleanedEntry = [ordered]@{}
    
    # Add fields in the desired order
    $cleanedEntry['_id'] = $entry.'_id'
    $cleanedEntry['Company Name'] = $entry.'Company Name'
    $cleanedEntry['EmailID'] = $entry.EmailID
    $cleanedEntry['created_at'] = $entry.created_at
    $cleanedEntry['created_by'] = $entry.created_by
    
    $cleanedData += $cleanedEntry
}

# Convert to JSON with consistent formatting
$json = $cleanedData | ConvertTo-Json -Depth 10
# Make _id format more compact
$json = $json -replace '"_id"\s*:\s*{\s*"\$oid"\s*:\s*"([^"]+)"\s*}', '"_id": {"$oid": "$1"}'
# Save the file
$json | Set-Content $jsonPath -Encoding UTF8

Write-Output "JSON file has been cleaned and formatted."
