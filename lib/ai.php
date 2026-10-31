<?php
// ============================================================================
// ROWAN COPY: AI WEBSITE DESIGNER
// Talks to Claude to create a website from a description, or to change an
// existing one. Streams the HTML back as it is written.
// ============================================================================

declare(strict_types=1);

require_once RC_ROOT . '/vendor/autoload.php';

use Anthropic\Client;

const RC_SYSTEM_PROMPT = <<<'PROMPT'
You are the website designer inside Rowan Copy, a website builder for small businesses. Customers describe their business in plain language and you build or update their website.

Output rules (these are strict, the output is published automatically):
- Reply with one complete HTML document and nothing else: start with <!DOCTYPE html> and end with </html>. No Markdown, no code fences, no commentary before or after.
- Everything lives in that one file: CSS in a <style> tag, any JavaScript in a <script> tag. The only external resources allowed are Google Fonts and the customer's own image URLs listed in the request.
- Do not use any other image URLs, because they would break. Where an image would help and none is provided, use CSS gradients, shapes, or inline SVG illustrations instead.
- Do not use localStorage, sessionStorage, cookies, or window.parent/top; the page runs in a sandbox where they are unavailable.

Design standards:
- Build a polished, modern, one-page site with a sticky header nav that links to sections on the page (for example #about, #services, #contact).
- Fully responsive: it must look great on a 375px-wide phone and on a desktop. Include a working mobile menu.
- Choose a cohesive color palette and font pairing that fits the business and any style the customer asked for. Good contrast, generous spacing, clear hierarchy, accessible markup (semantic tags, alt text, labels on form fields).
- Write real, specific, persuasive copy based on what the customer told you. Never use lorem ipsum.
- Never invent facts the customer did not give you: no made-up phone numbers, addresses, prices, reviews, testimonials, awards, or years in business. Where such a detail belongs and is unknown, put a clearly bracketed placeholder like [Your phone number] so the customer knows to fill it in.
- Include a <title> and a meta description.

Contact forms: when the site has a contact or booking form, use exactly
<form method="post" action="{{FORM_ACTION}}">
with descriptive name attributes on each field (name, email, phone, message, and so on), plus this hidden spam trap inside the form:
<input type="text" name="_hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
Keep the literal text {{FORM_ACTION}}; Rowan Copy replaces it. Submissions show up in the customer's Rowan Copy inbox.

When you are asked to change an existing site: apply exactly the requested change, keep everything else the same (content, layout, colors, form setup), and return the full updated document.
PROMPT;

function ai_client(): Client
{
    $key = (string) (cfg('anthropic_api_key') ?: getenv('ANTHROPIC_API_KEY'));
    if ($key === '') {
        throw new RuntimeException('No Claude API key is configured. Add it to config.php.');
    }
    return new Client(apiKey: $key);
}

/** Build the user message for creating a brand-new site. */
function ai_create_message(array $site, string $brief, array $images): string
{
    $msg = "Create a website for this business.\n\nBusiness name: {$site['name']}\n\nWhat the customer told us:\n{$brief}\n";
    return $msg . ai_images_note($images);
}

/** Build the user message for editing an existing site. */
function ai_edit_message(string $currentHtml, string $instruction, array $images): string
{
    return "Here is the customer's current website:\n\n<current_website>\n{$currentHtml}\n</current_website>\n\n"
        . "The customer asked for this change:\n<change_request>\n{$instruction}\n</change_request>\n"
        . ai_images_note($images)
        . "\nReturn the complete updated HTML document.";
}

function ai_images_note(array $images): string
{
    if (!$images) {
        return "\nThe customer has not uploaded any images yet.\n";
    }
    $lines = array_map(fn ($img) => '- ' . image_url($img) . ' (' . $img['label'] . ')', $images);
    return "\nImages the customer uploaded (use these where they fit; these are the only image URLs you may use):\n"
        . implode("\n", $lines) . "\n";
}

/**
 * Stream a website from Claude.
 *
 * @param callable(string):void $onText  called with each chunk of HTML as it arrives
 * @param callable():void       $onPing  called on other stream events (keeps the browser connection alive)
 * @return array{html:string, stop_reason:?string, input_tokens:int, output_tokens:int}
 */
function ai_generate(string $userMessage, callable $onText, callable $onPing): array
{
    $stream = ai_client()->beta->messages->createStream(
        model: (string) cfg('model', 'claude-opus-5-5'),
        maxTokens: 64000,
        system: RC_SYSTEM_PROMPT,
        messages: [['role' => 'user', 'content' => $userMessage]],
        thinking: ['type' => 'adaptive'],
        outputConfig: ['effort' => (string) cfg('effort', 'medium')],
        // If the main model declines a request, Anthropic retries it on a fallback model automatically.
        fallbacks: 'default',
        betas: ['server-side-fallback-2026-07-01'],
    );

    $text = '';
    $stopReason = null;
    $inputTokens = 0;
    $outputTokens = 0;

    foreach ($stream as $event) {
        switch ($event->type) {
            case 'message_start':
                $inputTokens += (int) ($event->message->usage->inputTokens ?? 0);
                $onPing();
                break;
            case 'content_block_delta':
                if (($event->delta->type ?? '') === 'text_delta') {
                    $text .= $event->delta->text;
                    $onText($event->delta->text);
                } else {
                    $onPing();
                }
                break;
            case 'message_delta':
                $stopReason = $event->delta->stopReason ?? $stopReason;
                $outputTokens = (int) ($event->usage->outputTokens ?? $outputTokens);
                break;
            default:
                $onPing();
        }
    }

    return [
        'html' => $text,
        'stop_reason' => $stopReason,
        'input_tokens' => $inputTokens,
        'output_tokens' => $outputTokens,
    ];
}

/** Pull the HTML document out of the model's reply (in case it added anything around it). */
function extract_html(string $text): ?string
{
    $start = stripos($text, '<!DOCTYPE');
    if ($start === false) {
        $start = stripos($text, '<html');
    }
    $end = strripos($text, '</html>');
    if ($start === false || $end === false || $end < $start) {
        return null;
    }
    return substr($text, $start, $end - $start + strlen('</html>'));
}
