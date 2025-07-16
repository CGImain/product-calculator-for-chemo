# Read the JSON file
$jsonPath = 'static\data\c.json'
$jsonContent = Get-Content $jsonPath -Raw | ConvertFrom-Json

# Remove _id from each entry
foreach ($item in $jsonContent) {
    $item.PSObject.Properties.Remove('_id')
}

# Save the updated content
$jsonContent | ConvertTo-Json -Depth 10 | Set-Content $jsonPath -Encoding UTF8

Write-Output "All _id fields have been removed from the JSON file."
