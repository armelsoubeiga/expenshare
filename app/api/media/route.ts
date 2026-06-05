import { NextRequest, NextResponse } from 'next/server'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function getS3Client() {
  const endpoint = process.env.B2_ENDPOINT
  const accessKeyId = process.env.B2_KEY_ID
  const secretAccessKey = process.env.B2_APPLICATION_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('B2 storage not configured')
  }
  return new S3Client({
    endpoint,
    region: 'us-east-005',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })
}

const BUCKET = process.env.B2_BUCKET_NAME!

// GET /api/media?key=image/uuid.jpg  → redirige vers une URL signée (1h)
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get('key')
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    }

    const s3 = getS3Client()
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

    return NextResponse.redirect(signedUrl)
  } catch (error: unknown) {
    console.error('[API/media] Error:', error)
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
