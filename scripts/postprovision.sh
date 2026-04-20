#!/bin/bash

# Post-provision script for VIPER deployment
# This script runs after infrastructure is provisioned to:
# 1. Create Azure AI Search index if it doesn't exist
# 2. Create and configure search query key for frontend

set -e

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-}"
SEARCH_SERVICE="${AZURE_SEARCH_SERVICE_NAME:-}"
SEARCH_INDEX="${AZURE_SEARCH_INDEX_NAME:-viper-search}"
FRONTEND_APP="${SERVICE_FRONTEND_NAME:-}"

echo "Running post-provision configuration for VIPER..."

# Validate required parameters
if [ -z "$RESOURCE_GROUP" ]; then
    echo "ERROR: AZURE_RESOURCE_GROUP environment variable is not set"
    exit 1
fi

if [ -z "$SEARCH_SERVICE" ]; then
    echo "Azure Search Service not configured, skipping search index setup"
    exit 0
fi

if [ -z "$FRONTEND_APP" ]; then
    echo "ERROR: SERVICE_FRONTEND_NAME environment variable is not set"
    exit 1
fi

echo "Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Search Service: $SEARCH_SERVICE"
echo "  Search Index: $SEARCH_INDEX"
echo "  Frontend App: $FRONTEND_APP"

# Get Azure Search admin key
echo ""
echo "Retrieving Azure Search admin key..."
ADMIN_KEY=$(az search admin-key show \
    --service-name "$SEARCH_SERVICE" \
    --resource-group "$RESOURCE_GROUP" \
    --query primaryKey \
    -o tsv)

# Check if index exists
echo "Checking if search index exists..."
INDEX_URL="https://${SEARCH_SERVICE}.search.windows.net/indexes('${SEARCH_INDEX}')?api-version=2023-11-01"
INDEX_EXISTS=false

if az rest --method get --url "$INDEX_URL" --headers "api-key=$ADMIN_KEY" > /dev/null 2>&1; then
    INDEX_EXISTS=true
    echo "Search index '$SEARCH_INDEX' already exists"
else
    echo "Search index '$SEARCH_INDEX' does not exist, creating..."
fi

# Create index if it doesn't exist
if [ "$INDEX_EXISTS" = false ]; then
    TEMP_FILE=$(mktemp)
    
    cat > "$TEMP_FILE" << 'EOF'
{
  "name": "INDEX_NAME_PLACEHOLDER",
  "fields": [
    {"name": "id", "type": "Edm.String", "key": true, "searchable": false, "filterable": false, "sortable": false, "facetable": false},
    {"name": "videoName", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": true, "facetable": false},
    {"name": "videoSlug", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "segmentIndex", "type": "Edm.Int32", "searchable": false, "filterable": true, "sortable": true, "facetable": false},
    {"name": "segmentName", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "segmentEntryIndex", "type": "Edm.Int32", "searchable": false, "filterable": true, "sortable": true, "facetable": false},
    {"name": "startTimestamp", "type": "Edm.Double", "searchable": false, "filterable": true, "sortable": true, "facetable": false},
    {"name": "endTimestamp", "type": "Edm.Double", "searchable": false, "filterable": true, "sortable": true, "facetable": false},
    {"name": "sceneTheme", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "summary", "type": "Edm.String", "searchable": true, "filterable": false, "sortable": false, "facetable": false},
    {"name": "actions", "type": "Collection(Edm.String)", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "characters", "type": "Collection(Edm.String)", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "keyObjects", "type": "Collection(Edm.String)", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "sentiment", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "organization", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "organizationId", "type": "Edm.String", "searchable": false, "filterable": true, "sortable": false, "facetable": false},
    {"name": "collection", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "collectionId", "type": "Edm.String", "searchable": false, "filterable": true, "sortable": false, "facetable": false},
    {"name": "user", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "userId", "type": "Edm.String", "searchable": false, "filterable": true, "sortable": false, "facetable": false},
    {"name": "videoId", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "contentId", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "videoUrl", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "source", "type": "Edm.String", "searchable": true, "filterable": true, "sortable": false, "facetable": false},
    {"name": "content", "type": "Edm.String", "searchable": true, "filterable": false, "sortable": false, "facetable": false},
    {"name": "customFields", "type": "Collection(Edm.String)", "searchable": true, "filterable": true, "sortable": false, "facetable": false}
  ],
  "semantic": {
    "configurations": [
      {
        "name": "sem",
        "prioritizedFields": {
          "titleField": {"fieldName": "segmentName"},
          "contentFields": [
            {"fieldName": "summary"},
            {"fieldName": "actions"},
            {"fieldName": "characters"},
            {"fieldName": "keyObjects"},
            {"fieldName": "content"}
          ],
          "keywordsFields": [
            {"fieldName": "sceneTheme"},
            {"fieldName": "customFields"}
          ]
        }
      }
    ]
  }
}
EOF
    
    # Replace placeholder with actual index name - portable sed syntax for macOS and Linux
    sed "s/INDEX_NAME_PLACEHOLDER/$SEARCH_INDEX/g" "$TEMP_FILE" > "$TEMP_FILE.tmp"
    mv "$TEMP_FILE.tmp" "$TEMP_FILE"
    
    echo "Creating search index..."
    az rest --method put \
        --url "$INDEX_URL" \
        --headers "Content-Type=application/json" "api-key=$ADMIN_KEY" \
        --body "@$TEMP_FILE"
    
    rm -f "$TEMP_FILE"
    echo "Search index created successfully"
fi

# Configure search query key
echo ""
echo "Configuring Azure Search query key..."
TARGET_QUERY_KEY_NAME="viper-query-key"

# List existing query keys
QUERY_KEYS_JSON=$(az search query-key list \
    --service-name "$SEARCH_SERVICE" \
    --resource-group "$RESOURCE_GROUP")

# Check if jq is available for robust JSON parsing
if command -v jq >/dev/null 2>&1; then
    # Use jq for reliable JSON parsing
    SEARCH_QUERY_KEY=$(echo "$QUERY_KEYS_JSON" | jq -r ".[] | select(.name == \"$TARGET_QUERY_KEY_NAME\") | .key" | head -1)
    
    if [ -z "$SEARCH_QUERY_KEY" ] || [ "$SEARCH_QUERY_KEY" = "null" ]; then
        echo "Creating new query key '$TARGET_QUERY_KEY_NAME'..."
        QUERY_KEY_JSON=$(az search query-key create \
            --service-name "$SEARCH_SERVICE" \
            --resource-group "$RESOURCE_GROUP" \
            --name "$TARGET_QUERY_KEY_NAME")
        
        SEARCH_QUERY_KEY=$(echo "$QUERY_KEY_JSON" | jq -r '.key')
        echo "Query key created successfully"
    else
        echo "Query key '$TARGET_QUERY_KEY_NAME' already exists"
    fi
else
    # Fallback to grep/sed if jq is not available
    echo "Note: jq not found, using fallback JSON parsing"
    if echo "$QUERY_KEYS_JSON" | grep -q "\"name\": \"$TARGET_QUERY_KEY_NAME\""; then
        echo "Query key '$TARGET_QUERY_KEY_NAME' already exists"
        SEARCH_QUERY_KEY=$(echo "$QUERY_KEYS_JSON" | grep -A 1 "\"name\": \"$TARGET_QUERY_KEY_NAME\"" | grep "\"key\":" | sed 's/.*"key": "\([^"]*\)".*/\1/')
    else
        echo "Creating new query key '$TARGET_QUERY_KEY_NAME'..."
        QUERY_KEY_JSON=$(az search query-key create \
            --service-name "$SEARCH_SERVICE" \
            --resource-group "$RESOURCE_GROUP" \
            --name "$TARGET_QUERY_KEY_NAME")
        
        SEARCH_QUERY_KEY=$(echo "$QUERY_KEY_JSON" | grep "\"key\":" | sed 's/.*"key": "\([^"]*\)".*/\1/')
        echo "Query key created successfully"
    fi
fi

# Update frontend container app with search API key
echo ""
echo "Updating frontend container app with search API key..."
az containerapp update \
    --name "$FRONTEND_APP" \
    --resource-group "$RESOURCE_GROUP" \
    --set-env-vars "SEARCH_API_KEY=$SEARCH_QUERY_KEY" > /dev/null

echo ""
echo "Post-provision configuration completed successfully!"
