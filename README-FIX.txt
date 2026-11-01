EDITPROMPT WEDDING PACK FIX

This patch fixes the Wedding Video Prompt Pack download that previously contained only a placeholder.

1. Back up your current server.js.
2. Copy the server.js from this ZIP to your project root, replacing the existing server.js.
3. Copy the files in the downloads/ folder into your project's downloads/ folder.
4. Commit and push these changes to GitHub, then wait for Render deployment.

The wedding product is configured to serve downloads/EditPrompt_Wedding_Video_Prompt_Pack.zip. The product price and other products are unchanged.

If your local server.js has newer changes than the ZIP you provided, do not overwrite it blindly; instead change only the wedding product's file value from wedding-pack.txt to EditPrompt_Wedding_Video_Prompt_Pack.zip.
