# Read the JSON file
$jsonContent = Get-Content 'static\data\c.json' -Raw | ConvertFrom-Json

# Get current timestamp in the required format
$timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:sszzz"
$createdBy = "68515df4f0b858c18746bbb4"

# Update each company entry
foreach ($company in $jsonContent) {
    # Skip if already has _id (already processed)
    if (-not $company.PSObject.Properties['_id']) {
        # Generate a new ObjectId-like string (24 character hex)
        $objectId = [guid]::NewGuid().ToString("n").Substring(0, 24)
        
        # Add the required fields
        $company | Add-Member -MemberType NoteProperty -Name '_id' -Value @{
'$oid' = $objectId
} -Force
        
        $company | Add-Member -MemberType NoteProperty -Name 'created_at' -Value $timestamp -Force
        $company | Add-Member -MemberType NoteProperty -Name 'created_by' -Value $createdBy -Force
    }
}

# Convert back to JSON and save
$jsonContent | ConvertTo-Json -Depth 10 | Set-Content 'static\data\c.json' -Encoding UTF8

Write-Output "Successfully updated companies.json with the required fields."
