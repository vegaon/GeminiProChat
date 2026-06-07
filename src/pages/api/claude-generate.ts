import Anthropic from '@anthropic-ai/sdk'
import { verifySignature } from '@/utils/auth'
import type { APIRoute } from 'astro'

const client = new Anthropic({ apiKey: import.meta.env.ANTHROPIC_API_KEY })
const sitePassword = import.meta.env.SITE_PASSWORD || ''
const passList = sitePassword.split(',') || []

export const post: APIRoute = async(context) => {
  const body = await context.request.json()
  const { sign, time, messages, pass } = body

  if (!messages || messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid message history: The last message must be from user role.',
      },
    }), { status: 400 })
  }

  if (sitePassword && !(sitePassword === pass || passList.includes(pass))) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid password.',
      },
    }), { status: 401 })
  }

  if (import.meta.env.PROD && !await verifySignature({ t: time, m: messages[messages.length - 1].parts.map(part => part.text).join('') }, sign)) {
    return new Response(JSON.stringify({
      error: {
        message: 'Invalid signature.',
      },
    }), { status: 401 })
  }

  // Convert Gemini-style messages ({ role: 'user'|'model', parts: [{text}] })
  // to Anthropic format ({ role: 'user'|'assistant', content: string })
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg: { role: string; parts: { text: string }[] }) => ({
    role: msg.role === 'model' ? 'assistant' : 'user' as 'user' | 'assistant',
    content: msg.parts.map(p => p.text).join(''),
  }))

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      messages: anthropicMessages,
    })

    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          controller.close()
        } catch (e) {
          controller.error(e)
        }
      },
    })

    return new Response(responseStream, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({
      error: {
        code: error.name,
        message: error.message,
      },
    }), { status: 500 })
  }
}
