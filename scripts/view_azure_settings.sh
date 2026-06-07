    APP_OBJECT_ID=4f6404e7-9761-4469-ab47-ed45983bbc2c
    
        az rest --method get \
      --uri "https://graph.microsoft.com/v1.0/applications/$APP_OBJECT_ID?$select=spa" \
      --query spa -o json

