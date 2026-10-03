# Security reporting

Do not post access tokens, private repository files, OAuth credentials or private keys in public issues. Use GitHub's private vulnerability reporting when the repository owner enables it, or contact the owner privately through their published contact channel.

Reports should identify the affected version, viewer surface, reproduction steps and whether the issue crosses the isolated HTML, extension worker, repository scope or VS Code message boundary. Use a minimal synthetic example where possible.

The extension stores authentication tokens in session storage. Repository HTML previews run separately from privileged viewer documents. Design files are read-only; review annotations can be stored locally or explicitly published. See the extension documentation for current isolation and compatibility limits.
