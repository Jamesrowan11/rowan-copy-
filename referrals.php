<?php
// "Refer a friend": the customer's link, how it works, and how their referrals are doing.
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/layout.php';

$user = require_login();
if (!referrals_enabled()) {
    redirect('dashboard.php');
}
$link = referral_link($user);
$s = referral_settings();

$stmt = db()->prepare('SELECT r.status, r.reward_cents, r.created_at, u.name FROM referrals r JOIN users u ON u.id = r.referred_id
    WHERE r.referrer_id = ? ORDER BY r.id DESC');
$stmt->execute([$user['id']]);
$rows = $stmt->fetchAll();
$earned = array_sum(array_map(fn ($r) => $r['status'] === 'rewarded' ? (int) $r['reward_cents'] : 0, $rows));
$paying = count(array_filter($rows, fn ($r) => $r['status'] === 'rewarded'));

$subject = 'A free month of Rowan Copy';
$body = "I use Rowan Copy for my website. Sign up with my link and your first month on any paid plan is free:\n\n$link";

page_header('Refer a friend');
?>
<div class="pg pg-narrow">
  <div class="pg-head"><div><h1>Refer a friend</h1><p class="muted">Know someone who needs a website?</p></div></div>

  <section class="box hero-box refer">
    <span class="refer-gift" aria-hidden="true"><?= icon('gift') ?></span>
    <h2>Give a free month, get a free month</h2>
    <p class="muted">Your friend gets their first <?= (int) $s['friend_trial_days'] ?> days on any paid plan free.
      When they become a paying customer, you get a month of your plan free, added as credit to your next bill.</p>
    <div class="copy-row">
      <label for="ref-link" class="sr-only">Your referral link</label>
      <input id="ref-link" value="<?= h($link) ?>" readonly>
      <button class="btn btn-accent" type="button" id="copy-btn"><?= icon('check') ?><span>Copy link</span></button>
    </div>
    <div class="share-row">
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=<?= rawurlencode($subject) ?>&body=<?= rawurlencode($body) ?>"><?= icon('mail') ?> Email</a>
      <a class="btn btn-ghost btn-sm" href="sms:?&body=<?= rawurlencode($body) ?>">Text</a>
      <a class="btn btn-ghost btn-sm" href="https://www.facebook.com/sharer/sharer.php?u=<?= rawurlencode($link) ?>" target="_blank" rel="noopener">Facebook</a>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=<?= rawurlencode($link) ?>" target="_blank" rel="noopener">LinkedIn</a>
      <button class="btn btn-ghost btn-sm" type="button" id="share-btn" hidden>More…</button>
    </div>
  </section>

  <div class="kpis">
    <div class="box kpi"><span class="kicker">Signed up</span><strong><?= count($rows) ?></strong></div>
    <div class="box kpi"><span class="kicker">Became customers</span><strong><?= $paying ?></strong></div>
    <div class="box kpi"><span class="kicker">Credit earned</span><strong>$<?= number_format($earned / 100, 2) ?></strong></div>
  </div>

  <?php if ($rows): ?>
    <h2 class="pg-h2">Your friends</h2>
    <div class="box box-flush"><table class="tbl">
      <thead><tr><th>Friend</th><th>Joined</th><th>Status</th></tr></thead>
      <tbody>
      <?php foreach ($rows as $r): ?>
        <tr>
          <td><strong><?= h(strtok($r['name'], ' ')) ?></strong></td>
          <td><?= h(date('M j, Y', strtotime($r['created_at'] . ' UTC'))) ?></td>
          <td><?= $r['status'] === 'rewarded' ? '<span class="tag tag-ok">You earned $' . number_format($r['reward_cents'] / 100, 2) . '</span>'
              : ($r['status'] === 'capped' ? '<span class="tag">Yearly limit reached</span>' : '<span class="tag tag-accent">Not paying yet</span>') ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table></div>
  <?php endif; ?>

  <p class="muted small">Credit goes on your Rowan Copy bill and can't be paid out as cash. Up to <?= (int) $s['max_rewards_per_year'] ?> rewards a year.
    Your friend has to be new to Rowan Copy and sign up through your link.</p>
</div>
<script>
(function () {
  var input = document.getElementById('ref-link'), btn = document.getElementById('copy-btn'), label = btn.querySelector('span');
  input.addEventListener('focus', function () { input.select(); });
  btn.addEventListener('click', function () {
    input.select();
    (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).catch(function () { document.execCommand('copy'); })
      .finally(function () { label.textContent = 'Copied!'; btn.classList.add('is-done'); window.rcToast && window.rcToast('Link copied'); setTimeout(function () { label.textContent = 'Copy link'; btn.classList.remove('is-done'); }, 2000); });
  });
  var share = document.getElementById('share-btn');
  if (navigator.share) {
    share.hidden = false;
    share.addEventListener('click', function () { navigator.share({ title: <?= json_encode($subject) ?>, text: <?= json_encode($body) ?> }).catch(function () {}); });
  }
})();
</script>
<?php page_footer();
