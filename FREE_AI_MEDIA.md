# EditPrompt V7.7 video providers

EditPrompt now supports remote Wan 2.2 video providers instead of depending on one Hugging Face ZeroGPU queue.

## Recommended remote setup

Set these server-side environment variables:

```
FREE_ONLY_MEDIA=false
PAID_VIDEO_ENABLED=true
FAL_KEY=your_fal_key
FAL_VIDEO_T2V_MODEL=fal-ai/wan/v2.2-a14b/text-to-video
FAL_VIDEO_I2V_MODEL=fal-ai/wan/v2.2-a14b/image-to-video
```

Optional Replicate fallback:

```
REPLICATE_API_TOKEN=your_replicate_token
REPLICATE_VIDEO_T2V_MODEL=wan-video/wan-2.2-t2v-fast
REPLICATE_VIDEO_I2V_MODEL=wan-video/wan-2.2-i2v-fast
```

Provider order is:

`fal.ai → Replicate → Hugging Face ZeroGPU → other configured providers`

Paid providers are never used unless `PAID_VIDEO_ENABLED=true`. API keys stay on the server and are not sent to the browser.

Hugging Face remains an optional free fallback, but its ZeroGPU quota can still be exhausted.
