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
<div class="page narrow">
  <p class="eyebrow">Refer a friend</p>
  <h1>Give a free month, get a free month.</h1>
  <p class="lead-left">Share your link. Your friend gets their first <?= (int) $s['friend_trial_days'] ?> days on any paid plan free.
    When they become a paying customer, you get a month of your plan free, added as credit to your next bill.</p>

  <div class="card">
    <label for="ref-link">Your link</label>
    <div class="copy-row">
      <input id="ref-link" value="<?= h($link) ?>" readonly onclick="this.select()">
      <button class="btn" type="button" id="copy-btn">Copy</button>
    </div>
    <div class="row-actions share-row">
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=<?= rawurlencode($subject) ?>&body=<?= rawurlencode($body) ?>">Email it</a>
      <a class="btn btn-ghost btn-sm" href="sms:?&body=<?= rawurlencode($body) ?>">Text it</a>
      <a class="btn btn-ghost btn-sm" href="https://www.facebook.com/sharer/sharer.php?u=<?= rawurlencode($link) ?>" target="_blank" rel="noopener">Facebook</a>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=<?= rawurlencode($link) ?>" target="_blank" rel="noopener">LinkedIn</a>
    </div>
  </div>

  <div class="stat-row">
    <div class="stat"><strong><?= count($rows) ?></strong><span>friends signed up</span></div>
    <div class="stat"><strong><?= $paying ?></strong><span>became customers</span></div>
    <div class="stat"><strong>$<?= number_format($earned / 100, 2) ?></strong><span>credit earned</span></div>
  </div>

  <?php if ($rows): ?>
    <div class="table-wrap"><table>
      <tr><th>Friend</th><th>Joined</th><th>Status</th></tr>
      <?php foreach ($rows as $r): ?>
        <tr>
          <td><?= h(strtok($r['name'], ' ')) ?></td>
          <td><?= h(date('M j, Y', strtotime($r['created_at'] . ' UTC'))) ?></td>
          <td><?= $r['status'] === 'rewarded' ? '✓ You earned $' . number_format($r['reward_cents'] / 100, 2)
              : ($r['status'] === 'capped' ? 'Yearly reward limit reached' : 'Signed up, not paying yet') ?></td>
        </tr>
      <?php endforeach; ?>
    </table></div>
  <?php endif; ?>

  <p class="muted small">Credit goes on your Rowan Copy bill and can't be paid out as cash. Up to <?= (int) $s['max_rewards_per_year'] ?> rewards a year.
    Your friend has to be new to Rowan Copy and sign up through your link.</p>
</div>
<script>
document.getElementById('copy-btn').addEventListener('click', function () {
  var input = document.getElementById('ref-link'), btn = this;
  input.select();
  (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).catch(function () { document.execCommand('copy'); })
    .finally(function () { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = 'Copy'; }, 2000); });
});
</script>
<?php page_footer();
