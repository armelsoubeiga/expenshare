import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT!,
  region: 'us-east-005',
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APPLICATION_KEY!,
  },
})

const BUCKET = process.env.B2_BUCKET_NAME!

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { content: string; content_type: string; extension?: string }

    if (!body.content || !body.content_type) {
      return NextResponse.json({ error: 'Missing content or content_type' }, { status: 400 })
    }

    // content est une data URL: "data:image/jpeg;base64,/9j/4AAQ..."
    const matches = body.content.match(/^data:(.+);base64,(.+)$/)
    if (!matches) {
      return NextResponse.json({ error: 'Invalid base64 content' }, { status: 400 })
    }

    const mimeType = matches[1]
    const base64Data = matches[2]
    const buffer = Buffer.from(base64Data, 'base64')

    const ext = body.extension || mimeType.split('/')[1] || 'bin'
    const key = `${body.content_type}/${crypto.randomUUID()}.${ext}`

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }))

    return NextResponse.json({ key }, { status: 201 })
  } catch (error: unknown) {
    console.error('[API/upload] Error:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
