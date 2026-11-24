<?php
// The owner's page for one website's Portal: buy the add-on, invite staff and
// clients, see who has signed in, cancel.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
$site = owned_site((int) ($_GET['id'] ?? 0), $user);
$back = 'site-portal.php?id=' . $site['id'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = (string) ($_POST['action'] ?? '');
    try {
        switch ($action) {
            case 'buy':
                if (!portal_can_buy($user)) {
                    throw new RuntimeException('The Portal is an add-on for paid plans. Pick a plan on the Billing page first.');
                }
                if (!stripe_enabled()) {
                    throw new RuntimeException('The Portal isn\'t available right now. Please try again later.');
                }
                if (portal_live($site)) {
                    break;
                }
                header('Location: ' . portal_checkout_url($user, $site), true, 303);
                exit;

            case 'cancel':
            case 'resume':
                if (!portal_live($site) || !$site['portal_subscription_id']) {
                    break;
                }
                $cancel = $action === 'cancel';
                sync_subscription(stripe()->subscriptions->update((string) $site['portal_subscription_id'], ['cancel_at_period_end' => $cancel]));
                flash($cancel ? 'Your Portal will close at the end of this billing period. Everyone keeps access until then.' : 'Great, your Portal will keep renewing.');
                break;

            case 'invite':
                if (!portal_live($site)) {
                    throw new RuntimeException('Add the Portal to this website first.');
                }
                if (!throttle('portal-invite:' . $user['id'], 60, 3600)) {
                    throw new RuntimeException('That\'s a lot of invites at once. Please wait a little and try again.');
                }
                $role = (string) ($_POST['role'] ?? '');
                $email = post_str('email', 200);
                portal_invite($site, post_str('name', 100), $email, $role);
                flash('Invite sent to ' . strtolower($email) . '.');
                break;

            case 'resend':
                $pu = portal_user((int) $site['id'], (int) ($_POST['user_id'] ?? 0));
                if ($pu && portal_live($site)) {
                    portal_invite($site, $pu['name'], $pu['email'], $pu['role'], $pu);
                    flash("New invite sent to $pu[email].");
                }
                break;

            case 'remove':
                $pu = portal_user((int) $site['id'], (int) ($_POST['user_id'] ?? 0));
                if ($pu) {
                    db()->prepare('DELETE FROM portal_users WHERE id = ?')->execute([$pu['id']]);
                    flash("$pu[name] no longer has access to the portal.");
                }
                break;
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
        flash('We couldn\'t reach our payment provider. Please try again in a minute.', 'err');
    } catch (RuntimeException $e) {
        flash($e->getMessage(), 'err');
    }
    redirect($back);
}

// Back from Stripe Checkout: turn the Portal on now instead of waiting for the webhook.
if (isset($_GET['paid']) && stripe_enabled() && preg_match('/^cs_[A-Za-z0-9_]+$/', (string) $_GET['paid'])) {
    try {
        $cs = stripe()->checkout->sessions->retrieve((string) $_GET['paid'], ['expand' => ['subscription']]);
        if ($cs->customer === $user['stripe_customer_id'] && $cs->subscription instanceof \Stripe\Subscription) {
            sync_subscription($cs->subscription);
            flash('Your Portal is on! Invite your staff and clients below.');
        }
    } catch (\Stripe\Exception\ApiErrorException $e) {
        error_log('Rowan Copy Stripe error: ' . $e->getMessage());
    }
    redirect($back);
}

$site = owned_site((int) $site['id'], $user);
$live = portal_live($site);
$staff = portal_users((int) $site['id'], 'staff');
$clients = portal_users((int) $site['id'], 'client');
$set = portal_settings();

page_header('Portal · ' . $site['name']);

$row = function (array $pu) use ($site): string {
    ob_start(); ?>
    <li>
      <span class="avatar" aria-hidden="true"><?= h(mb_strtoupper(mb_substr($pu['name'], 0, 1))) ?></span>
      <div class="mailbox-who"><strong><?= h($pu['name']) ?></strong><span class="muted small"><?= h($pu['email']) ?></span></div>
      <?= $pu['password_hash']
          ? '<span class="tag tag-ok">' . ($pu['last_login_at'] ? 'Last in ' . h(time_ago($pu['last_login_at'])) : 'Joined') . '</span>'
          : '<span class="tag tag-accent">Invite sent</span>' ?>
      <details class="menu menu-down">
        <summary class="btn btn-ghost btn-sm" aria-label="Options for <?= h($pu['name']) ?>"><?= icon('more') ?></summary>
        <div class="menu-list menu-pop">
          <?php if (!$pu['password_hash']): ?>
            <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="resend"><input type="hidden" name="user_id" value="<?= (int) $pu['id'] ?>">
              <button class="menu-item">Send the invite again</button></form>
          <?php endif; ?>
          <form method="post" data-confirm="Remove <?= h($pu['name']) ?> from the portal? They won't be able to sign in any more."><?= csrf_field() ?>
            <input type="hidden" name="action" value="remove"><input type="hidden" name="user_id" value="<?= (int) $pu['id'] ?>">
            <button class="menu-danger">Remove access</button></form>
        </div>
      </details>
    </li>
    <?php return (string) ob_get_clean();
};
?>
<div class="pg pg-narrow">
  <div class="pg-head">
    <div>
      <a class="back" href="<?= h(base_url('editor.php?id=' . $site['id'])) ?>"><?= icon('arrow-left') ?> <?= h($site['name']) ?></a>
      <h1>Portal</h1>
      <p class="muted">A private sign-in area on your website for your staff and your clients.</p>
    </div>
    <?php if ($live): ?>
      <div class="pg-actions"><a class="btn btn-ghost" href="<?= h(portal_url($site)) ?>" target="_blank" rel="noopener"><?= icon('external') ?> Open your portal</a></div>
    <?php endif; ?>
  </div>

  <?php if (!$live): ?>
    <section class="box hero-box portal-pitch">
      <span class="tag tag-accent">Add-on · <?= h(portal_price_text()) ?></span>
      <h2>Give your team and your clients their own place to sign in</h2>
      <div class="portal-sides">
        <div>
          <h3>Staff portal</h3>
          <ul class="ticks">
            <li><?= icon('check') ?>Team directory and their work email</li>
            <li><?= icon('check') ?>Announcements, schedules and to-dos <span class="tag">Coming soon</span></li>
            <li><?= icon('check') ?>Shared files <span class="tag">Coming soon</span></li>
          </ul>
        </div>
        <div>
          <h3>Client portal</h3>
          <ul class="ticks">
            <li><?= icon('check') ?>A private page for each client, with a way to contact you</li>
            <li><?= icon('check') ?>Documents and invoices to download <span class="tag">Coming soon</span></li>
            <li><?= icon('check') ?>Messages with your business <span class="tag">Coming soon</span></li>
          </ul>
        </div>
      </div>
      <p class="muted small">Up to <?= (int) $set['max_staff'] ?> staff and <?= (int) $set['max_clients'] ?> clients. A “Portal sign in” button is added to your website. Cancel any time.
        The “coming soon” tools are being added over the next few weeks and are included at no extra cost.</p>
      <?php if (portal_can_buy($user)): ?>
        <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="buy">
          <button class="btn btn-accent btn-lg"><?= icon('plus') ?> Add the Portal for <?= h(portal_price_text()) ?></button></form>
      <?php else: ?>
        <p class="notice">The Portal is an add-on for paid plans. <a class="link-accent" href="<?= h(base_url('billing.php')) ?>">See plans</a></p>
      <?php endif; ?>
    </section>
  <?php else: ?>
    <?php if ($site['portal_status'] === 'past_due'): ?>
      <p class="error" role="alert">The last payment for this Portal didn't go through. Update your card under Billing to keep it.</p>
    <?php endif; ?>
    <section class="box portal-status">
      <div>
        <span class="kicker">Portal</span>
        <strong class="portal-link"><?= h(preg_replace('#^https?://#', '', portal_url($site))) ?></strong>
        <span class="muted small"><?= h(portal_price_text()) ?><?php if ($site['portal_renews_at']): ?> · <?= $site['portal_cancels'] ? 'Closes' : 'Renews' ?> <?= h(date('F j, Y', strtotime($site['portal_renews_at'] . ' UTC'))) ?><?php endif; ?></span>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-copy="<?= h(portal_url($site)) ?>"><?= icon('check') ?><span>Copy link</span></button>
    </section>

    <section class="box">
      <div class="pg-row portal-section-head">
        <h2>Staff <span class="muted small">(<?= count($staff) ?> of <?= (int) $set['max_staff'] ?>)</span></h2>
        <button type="button" class="btn btn-accent btn-sm" data-dialog-open="invite-staff"><?= icon('plus') ?> Invite staff</button>
      </div>
      <?php if (!$staff): ?><p class="muted small">Invite your employees. They'll get an email to set their password.</p><?php endif; ?>
      <ul class="mailboxes"><?php foreach ($staff as $pu) echo $row($pu); ?></ul>
    </section>

    <section class="box">
      <div class="pg-row portal-section-head">
        <h2>Clients <span class="muted small">(<?= count($clients) ?> of <?= (int) $set['max_clients'] ?>)</span></h2>
        <button type="button" class="btn btn-accent btn-sm" data-dialog-open="invite-client"><?= icon('plus') ?> Invite a client</button>
      </div>
      <?php if (!$clients): ?><p class="muted small">Invite your customers so they can see their documents and message you.</p><?php endif; ?>
      <ul class="mailboxes"><?php foreach ($clients as $pu) echo $row($pu); ?></ul>
    </section>

    <?php foreach (['staff' => 'Invite a staff member', 'client' => 'Invite a client'] as $role => $title): ?>
      <dialog class="dlg" id="invite-<?= $role ?>" aria-label="<?= h($title) ?>">
        <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="invite"><input type="hidden" name="role" value="<?= $role ?>">
          <h2><?= h($title) ?></h2>
          <label>Name <input name="name" required maxlength="100" autocomplete="off"></label>
          <label>Email <input type="email" name="email" required maxlength="200" autocomplete="off"></label>
          <p class="muted small">We'll email them a link to set their password. It works for 7 days.</p>
          <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-dialog-close>Cancel</button><button class="btn btn-accent">Send invite</button></div>
        </form>
      </dialog>
    <?php endforeach; ?>

    <section class="box">
      <h2>Your website</h2>
      <p class="muted small">A “Portal sign in” button now shows in the corner of your published website. You can also ask the AI in the editor to add a “Portal” link to your menu that goes to
        <code class="wrap"><?= h(portal_url($site)) ?></code></p>
      <?php if ($site['portal_cancels']): ?>
        <form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="resume"><button class="btn btn-accent btn-sm">Keep my Portal</button></form>
      <?php else: ?>
        <form method="post" data-confirm="Close this Portal at the end of the billing period? Staff and clients lose access then."><?= csrf_field() ?>
          <input type="hidden" name="action" value="cancel"><button class="link small">Cancel the Portal</button></form>
      <?php endif; ?>
    </section>
  <?php endif; ?>
</div>
<script>
document.querySelectorAll('[data-copy]').forEach(function (b) {
  b.addEventListener('click', function () {
    var label = b.querySelector('span');
    (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(function () {
      label.textContent = 'Copied!'; window.rcToast && window.rcToast('Portal link copied');
      setTimeout(function () { label.textContent = 'Copy link'; }, 2000);
    }).catch(function () { prompt('Copy this link:', b.dataset.copy); });
  });
});
</script>
<?php page_footer();
