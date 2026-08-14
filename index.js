const core = require('@actions/core');
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE = 'https://api.cnb.cool';

function log(message) {
  console.log(`[CNB Release] ${message}`);
}

function errorExit(message) {
  core.setFailed(message);
  process.exit(1);
}

function httpsRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function createRelease(token, repo, tagName, targetCommitish, releaseName, body, draft, prerelease, makeLatest) {
  log(`Creating release with tag: ${tagName}`);
  
  const payload = JSON.stringify({
    tag_name: tagName,
    target_commitish: targetCommitish,
    name: releaseName || tagName,
    body: body,
    draft: draft === 'true',
    prerelease: prerelease === 'true',
    make_latest: makeLatest
  });

  const options = {
    hostname: 'api.cnb.cool',
    path: `/${repo}/-/releases`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const response = await httpsRequest(options, payload);
  
  if (response.status !== 201) {
    errorExit(`Failed to create release: ${response.data.errmsg || JSON.stringify(response.data)}`);
  }

  log(`Release created. ID: ${response.data.id}`);
  return response.data.id;
}

async function getUploadUrl(token, repo, releaseId, assetName, fileSize, overwrite, ttl) {
  const payload = JSON.stringify({
    asset_name: assetName,
    size: fileSize,
    overwrite: overwrite === 'true',
    ttl: parseInt(ttl)
  });

  const options = {
    hostname: 'api.cnb.cool',
    path: `/${repo}/-/releases/${releaseId}/asset-upload-url`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const response = await httpsRequest(options, payload);
  
  if (!response.data.upload_url) {
    errorExit(`Failed to get upload URL for ${assetName}: ${response.data.errmsg || JSON.stringify(response.data)}`);
  }

  return { uploadUrl: response.data.upload_url, verifyUrl: response.data.verify_url };
}

async function uploadFile(uploadUrl, filePath) {
  const fileContent = fs.readFileSync(filePath);
  const url = new URL(uploadUrl);

  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': fileContent.length
    }
  };

  const response = await httpsRequest(options, fileContent);
  
  if (response.status !== 200 && response.status !== 201) {
    errorExit(`Failed to upload file: HTTP ${response.status}`);
  }
}

async function confirmUpload(verifyUrl) {
  const url = new URL(verifyUrl);

  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST'
  };

  const response = await httpsRequest(options);
  
  if (response.data.errcode && response.data.errcode !== 0) {
    errorExit(`Failed to confirm upload: ${response.data.errmsg}`);
  }
}

function collectFiles(filePath) {
  const files = [];
  const stat = fs.statSync(filePath);
  
  if (stat.isFile()) {
    files.push(filePath);
  } else if (stat.isDirectory()) {
    const entries = fs.readdirSync(filePath, { recursive: true });
    for (const entry of entries) {
      const fullPath = path.join(filePath, entry);
      if (fs.statSync(fullPath).isFile()) {
        files.push(fullPath);
      }
    }
  } else {
    errorExit(`Path is neither file nor directory: ${filePath}`);
  }
  
  return files;
}

async function run() {
  try {
    const token = core.getInput('token', { required: true });
    const repo = core.getInput('repo', { required: true });
    const tagName = core.getInput('tag_name', { required: true });
    const targetCommitish = core.getInput('target_commitish') || 'main';
    const releaseName = core.getInput('release_name');
    const body = core.getInput('body');
    const draft = core.getInput('draft') || 'false';
    const prerelease = core.getInput('prerelease') || 'false';
    const makeLatest = core.getInput('make_latest') || 'true';
    const filePath = core.getInput('file_path', { required: true });
    const overwrite = core.getInput('overwrite') || 'true';
    const ttl = core.getInput('ttl') || '0';

    // Step 1: Create release
    const releaseId = await createRelease(
      token, repo, tagName, targetCommitish,
      releaseName, body, draft, prerelease, makeLatest
    );
    core.setOutput('release_id', releaseId);

    // Step 2: Collect files
    const files = collectFiles(filePath);
    log(`Found ${files.length} file(s) to upload`);

    const uploadedAssets = [];

    // Step 3-5: Upload each file
    for (const file of files) {
      const assetName = path.basename(file);
      const fileSize = fs.statSync(file).size;

      log(`Processing: ${assetName} (${fileSize} bytes)`);

      // Get upload URL
      const { uploadUrl, verifyUrl } = await getUploadUrl(
        token, repo, releaseId, assetName, fileSize, overwrite, ttl
      );

      // Upload file
      await uploadFile(uploadUrl, file);
      log(`Uploaded: ${assetName}`);

      // Confirm upload
      await confirmUpload(verifyUrl);
      log(`Confirmed: ${assetName}`);

      uploadedAssets.push(assetName);
    }

    core.setOutput('uploaded_assets', JSON.stringify(uploadedAssets));
    log(`Done! Uploaded ${uploadedAssets.length} file(s) to release ${tagName}`);

  } catch (error) {
    errorExit(error.message);
  }
}

run();
