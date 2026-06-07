    APP_OBJECT_ID=4f6404e7-9761-4469-ab47-ed45983bbc2c
    
    az rest --method patch \
      --uri "https://graph.microsoft.com/v1.0/applications/$APP_OBJECT_ID" \
      --body '{
        "spa": {
          "redirectUris": [
            "http://localhost:5173",
            "https://zealous-forest-053645a03.7.azurestaticapps.net"
          ]
        }
      }'
    

