# CNB Release

Create a release and upload assets to CNB platform in one action. Supports both files and directories.

## Usage

```yaml
- name: Create CNB Release
  uses: 0x6768/cnb-release@v1
  with:
    token: ${{ secrets.CNB_TOKEN }}
    repo: myorg/myrepo
    tag_name: v1.0.0
    file_path: ./dist
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| token | CNB access token with repo-release:rw permission | yes | - |
| repo | Repository name in org/repo format | yes | - |
| tag_name | Tag name for the release | yes | - |
| target_commitish | Branch name or commit SHA | no | main |
| release_name | Release title | no | tag_name |
| body | Release description | no | - |
| draft | Mark as draft release | no | false |
| prerelease | Mark as pre-release | no | false |
| make_latest | Set as latest release | no | true |
| file_path | File or directory path to upload | yes | - |
| overwrite | Overwrite existing assets with same name | no | true |
| ttl | Asset retention days, 0 means permanent | no | 0 |

## Outputs

| Name | Description |
|------|-------------|
| release_id | Created release ID |
| uploaded_assets | JSON array of uploaded asset names |

## Examples

### Upload a single file

```yaml
- uses: 0x6768/cnb-release@v1
  with:
    token: ${{ secrets.CNB_TOKEN }}
    repo: myorg/myrepo
    tag_name: v1.0.0
    file_path: ./app.zip
```

### Upload a directory

```yaml
- uses: 0x6768/cnb-release@v1
  with:
    token: ${{ secrets.CNB_TOKEN }}
    repo: myorg/myrepo
    tag_name: v1.0.0
    file_path: ./build-output
```

### Full workflow example

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: 0x6768/cnb-release@v1
        with:
          token: ${{ secrets.CNB_TOKEN }}
          repo: myorg/myrepo
          tag_name: ${{ github.ref_name }}
          release_name: Release ${{ github.ref_name }}
          body: "See changelog for details"
          file_path: ./dist
```

## How it works

This action performs three steps for each file:

1. **Create release** - Creates a release with the given tag name
2. **Upload file** - Gets a presigned URL and uploads the file
3. **Confirm upload** - Confirms the upload to attach the file to the release

If you provide a directory path, all files inside it will be uploaded automatically.

## License

MIT
