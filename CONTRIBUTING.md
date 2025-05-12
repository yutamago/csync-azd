### Creating a New Release

To create a new release:

1. Update the version number in `deno.json`:
   ```json
   {
     "name": "@yutamago/csync-azd",
     "version": "1.0.0",
     ...
   }
   ```
2. Commit your changes:
   ```
   git add deno.json
   git commit -m "Bump version to 1.0.0"
   ```
3. Create a new tag with a version number (e.g., `v1.0.0`):
   ```
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. The GitHub Actions workflow will automatically build the binaries and create a release with the version number from `deno.json`
