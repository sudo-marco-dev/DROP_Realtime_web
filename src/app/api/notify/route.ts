import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { trigger_type, image_url, timestamp, notes, camera_id, embeds } = body;

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('DISCORD_WEBHOOK_URL is not configured in env variables.');
      return NextResponse.json({ error: 'Webhook URL not configured' }, { status: 500 });
    }

    // Determine embed color and emojis based on event type
    let color = 3447003; // Light Blue (Default)
    let titleEmoji = 'ℹ️';

    switch (trigger_type) {
      case 'TAMPER_DETECTED':
        color = 15158332; // Red
        titleEmoji = '🚨';
        break;
      case 'WRONG_PIN':
        color = 15158332; // Red
        titleEmoji = '❌';
        break;
      case 'OWNER_LOGIN':
        color = 3066993; // Green
        titleEmoji = '🔑';
        break;
      case 'DELIVERY_SUCCESS':
        color = 3066993; // Green
        titleEmoji = '📦';
        break;
      case 'ARMED':
        color = 15105570; // Orange/Yellow
        titleEmoji = '🔒';
        break;
      case 'REMOTE_UNLOCK':
        color = 3066993; // Green
        titleEmoji = '🔓';
        break;
      case 'MANUAL_TEST':
        color = 10181046; // Purple
        titleEmoji = '🧪';
        break;
      default:
        break;
    }

    // Clean trigger type name for display
    const formattedTitle = trigger_type
      ? trigger_type.replace(/_/g, ' ')
      : 'UNKNOWN TRIGGER';

    // Build the embed array — either multi-camera embeds or single legacy embed
    let discordEmbeds: any[] = [];

    if (embeds && Array.isArray(embeds) && embeds.length > 0) {
      // Multi-camera mode: one embed per camera (max 10 to avoid Discord limits)
      const cameraEmbeds = embeds.slice(0, 10).map((cam: any) => ({
        title: `${titleEmoji} D.R.O.P. Event: ${formattedTitle}`,
        description: notes || 'No additional details provided.',
        color: color,
        timestamp: new Date(timestamp || Date.now()).toISOString(),
        footer: {
          text: 'D.R.O.P. Digital Twin System',
        },
        fields: cam.label ? [
          {
            name: '📷 Camera',
            value: cam.label,
            inline: true,
          }
        ] : [],
        image: cam.image_url ? { url: cam.image_url } : undefined,
      }));

      discordEmbeds = cameraEmbeds;
    } else {
      // Legacy single-camera mode
      const embed: any = {
        title: `${titleEmoji} D.R.O.P. Event: ${formattedTitle}`,
        description: notes || 'No additional details provided.',
        color: color,
        timestamp: new Date(timestamp || Date.now()).toISOString(),
        footer: {
          text: 'D.R.O.P. Digital Twin System',
        },
      };

      if (camera_id) {
        embed.fields = [
          {
            name: '🎥 Camera Source',
            value: `\`${camera_id}\``,
            inline: true,
          }
        ];
      }

      if (image_url) {
        embed.image = {
          url: image_url,
        };
      }

      discordEmbeds = [embed];
    }

    const discordPayload = {
      embeds: discordEmbeds,
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(discordPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send to Discord webhook:', response.status, errorText);
      return NextResponse.json({ error: 'Failed to notify Discord' }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing Discord notification:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}