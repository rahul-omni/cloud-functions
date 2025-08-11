'use strict';

const { Storage } = require('@google-cloud/storage');

async function main() {
  const args = process.argv.slice(2);
  const argMap = Object.fromEntries(
    args.map(a => {
      const [k, v] = a.startsWith('--') ? a.replace(/^--/, '').split('=') : [a, true];
      return [k, v === undefined ? true : v];
    })
  );

  const confirmed = argMap.yes === true || argMap.yes === 'true' || argMap.yes === '1';
  if (!confirmed) {
    console.error('Refusing to proceed without --yes. Add --yes to actually delete.');
    console.error('Usage: node clear_bucket.js --yes [--bucket=high-court-judgement-pdf] [--prefix=optional/path/]');
    process.exit(1);
  }

  const bucketName = (argMap.bucket || process.env.BUCKET_NAME || 'high-court-judgement-pdf').trim();
  const prefix = argMap.prefix ? String(argMap.prefix) : undefined;

  console.log(`Bucket: ${bucketName}`);
  console.log(`Prefix: ${prefix ?? '(none, deleting ALL objects in bucket)'}`);

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  try {
    console.log('Listing objects...');
    const [files] = await bucket.getFiles({ prefix });

    if (!files || files.length === 0) {
      console.log('No objects found matching the criteria. Nothing to delete.');
      return;
    }

    console.log(`Found ${files.length} object(s). Deleting...`);

    // Delete in chunks for reliability
    const chunkSize = 50;
    let deleted = 0;

    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(file => file.delete({ ignoreNotFound: true }).catch(err => {
          console.error(`Failed to delete ${file.name}: ${err.message}`);
        }))
      );
      deleted += chunk.length;
      console.log(`Progress: ${deleted}/${files.length} deleted`);
    }

    console.log('✅ Completed deletion.');
  } catch (err) {
    console.error(`❌ Error during deletion: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}); 