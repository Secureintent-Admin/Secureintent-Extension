<?php
ob_start();
require_once 'auth_check.php';
require_once 'config.php';
include 'header.php'; 

// Set Timezone
date_default_timezone_set('UTC');

$worker_id = $_SESSION['user_id'];
$job_id = isset($_GET['id']) ? intval($_GET['id']) : 0;

// 1. Fetch Job and Stats
$stmt = $conn->prepare("
    SELECT j.*, u.full_name as emp_name, u.created_at as emp_since, u.profile_picture as emp_pic,
    (SELECT COUNT(*) FROM job_submissions WHERE employer_id = j.employer_id AND status = 'approved') as total_emp_approved,
    (SELECT COUNT(*) FROM job_submissions WHERE employer_id = j.employer_id AND status = 'rejected') as total_emp_rejected
    FROM jobs j 
    JOIN users u ON j.employer_id = u.user_id 
    WHERE j.job_id = ?
");
$stmt->bind_param("i", $job_id);
$stmt->execute();
$job = $stmt->get_result()->fetch_assoc();

// 2. Fundamental Logic Checks
if (!$job) {
    header("Location: find_job.php?error=" . urlencode("This Job is Not found Try Another Job."));
    exit();
}

$employer_id = $job['employer_id'];
$target = $job['total_workers_needed'];
$filled = $job['filled_slots']; 

if ($employer_id == $worker_id) {
    header("Location: find_job.php?error=" . urlencode("This is your own Jobs (owner can't submit this Job) Try Another Job."));
    exit();
}

// --- BLOCK LOGIC ---
$block_check1 = $conn->prepare("SELECT id FROM blocked_workers WHERE employer_id = ? AND worker_id = ?");
$block_check1->bind_param("ii", $employer_id, $worker_id);
$block_check1->execute();
if ($block_check1->get_result()->num_rows > 0) {
    header("Location: find_job.php?error=" . urlencode("You are Blocked by this employer Try Another Job."));
    exit();
}

$block_check2 = $conn->prepare("SELECT id FROM blocked_employers WHERE worker_id = ? AND employer_id = ?");
$block_check2->bind_param("ii", $worker_id, $employer_id);
$block_check2->execute();
if ($block_check2->get_result()->num_rows > 0) {
    header("Location: find_job.php?error=" . urlencode("You have blocked this employer. Unblock them first to view this job."));
    exit();
}

// Check existing submission
$chk = $conn->prepare("SELECT submission_id, status, rejection_reason, submitted_at FROM job_submissions WHERE job_id = ? AND worker_id = ?");
$chk->bind_param("ii", $job_id, $worker_id);
$chk->execute();
$existing = $chk->get_result()->fetch_assoc();

// Slot Limit Check
if ($filled >= $target && (!$existing || $existing['status'] === 'rejected')) {
    header("Location: find_job.php?error=" . urlencode("This Job is No Longer available, Try Another Job."));
    exit();
}

if ($existing && !in_array($existing['status'], ['revision', 'rejected'])) {
    header("Location: find_job.php?error=" . urlencode("This Job is already submitted Try Another Job."));
    exit();
}

$is_revision = ($existing && $existing['status'] === 'revision');

// Social & Report Checks
$follow_check = $conn->prepare("SELECT id FROM followed_users WHERE follower_id = ? AND followed_id = ?");
$follow_check->bind_param("ii", $worker_id, $employer_id);
$follow_check->execute();
$is_following = $follow_check->get_result()->num_rows > 0;

$report_check = $conn->prepare("SELECT report_id FROM reports WHERE reporter_id = ? AND job_id = ?");
$report_check->bind_param("ii", $worker_id, $job_id);
$report_check->execute();
$is_reported = $report_check->get_result()->num_rows > 0;

$steps = json_decode($job['description'], true);
$proofs = json_decode($job['proof_required'], true);
$total_emp_subs = $job['total_emp_approved'] + $job['total_emp_rejected'];
$emp_rating = ($total_emp_subs > 0) ? round(($job['total_emp_approved'] / $total_emp_subs) * 100) : 100;
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Job Details | Seoworker</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root { 
            --primary-blue: #4B70E2;
            --light-blue: #F0F4FF;
            --success-green: #22C55E;
            --danger-red: #EF4444;
            --text-dark: #1E293B;
            --text-gray: #64748B;
            --bg-color: #F1F5F9;
            --card-bg: #FFFFFF;
            --border-color: #E2E8F0;
        }
        
        html, body { 
            background: var(--bg-color); 
            font-family: 'Roboto', sans-serif; 
            margin: 0; 
            padding: 0;
            color: var(--text-dark); 
            overflow-x: hidden; 
            width: 100%;
            box-sizing: border-box;
        }
        *, *::before, *::after { box-sizing: inherit; }

        .submit-page-container { 
            max-width: 600px; 
            margin: 20px auto; 
            padding: 0 12px; 
            display: flex;
            flex-direction: column;
            gap: 16px; 
        }

        .card { 
            background: var(--card-bg); 
            border: 1px solid var(--border-color); 
            border-radius: 8px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
            overflow: hidden;
            padding: 20px;
        }

        /* Top Progress Card */
        .progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 15px;
            margin-bottom: 15px;
        }
        .progress-title {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-gray);
            letter-spacing: 0.5px;
        }
        .progress-count {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-dark);
            margin-top: 5px;
        }
        .check-circle {
            background-color: var(--success-green);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }

        /* Earning Section */
        .earning-section { text-align: center; }
        .earn-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--text-gray);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
        }
        .earn-amount {
            font-size: 28px;
            font-weight: 700;
            color: var(--success-green);
        }
        .job-id-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--success-green);
            font-size: 13px;
            font-weight: 500;
            margin-top: 8px;
        }
        .last-updated {
            font-size: 12px;
            color: #94A3B8;
            margin-top: 10px;
        }

        /* Disclaimer Card */
        .disclaimer-card {
            background: var(--light-blue);
            border: 1px solid #D6E0FF;
            padding: 15px;
            border-radius: 8px;
            font-size: 14px;
            line-height: 1.5;
            color: #475569;
        }
        .disclaimer-card span {
            color: var(--danger-red);
            text-decoration: underline;
            font-weight: 500;
        }

        /* Job Info Section */
        .job-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
        }
        .job-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-dark);
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .job-title i { color: var(--text-gray); font-size: 16px; }
        
        .meta-list {
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .meta-list li {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            color: var(--text-gray);
        }
        .meta-list i { font-size: 14px; color: #94A3B8; width: 16px; text-align: center; }

        /* Actions row inserted cleanly */
        .actions-mini-row {
            display: flex;
            gap: 10px;
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px dashed var(--border-color);
        }
        .btn-mini {
            flex: 1;
            padding: 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            border: 1px solid var(--border-color);
            background: #fff;
            color: var(--text-dark);
            cursor: pointer;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            text-decoration: none;
        }
        .btn-mini:hover { background: var(--bg-color); }

        /* Section Headings (Blue style from video) */
        .section-heading-blue {
            color: var(--primary-blue);
            font-size: 15px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 15px 0;
            text-transform: none;
        }

        /* List Items */
        .worker-expected-list { padding-left: 5px; }
        .step-item {
            font-size: 14.5px;
            line-height: 1.6;
            color: #334155;
            margin-bottom: 12px;
            display: flex;
            gap: 8px;
        }
        .step-number { font-weight: 700; color: var(--text-dark); }
        .step-text { flex: 1; }

        /* Report Button (Video Style - bottom right of expected section) */
        .report-btn-wrapper {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid var(--border-color);
        }
        .btn-report-outline {
            border: 1px solid var(--danger-red);
            color: var(--danger-red);
            background: transparent;
            padding: 6px 16px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
        }
        .btn-report-outline:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Proofs Section */
        .warning-box {
            background-color: #FEF9C3;
            border-left: 3px solid #EAB308;
            padding: 12px 15px;
            font-size: 13.5px;
            color: #854D0E;
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
            align-items: flex-start;
        }
        .warning-box i { margin-top: 2px; }

        .submit-prove-heading {
            color: var(--primary-blue);
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            margin: 25px 0 15px 0;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        /* Form Inputs matching video */
        .proof-group { margin-bottom: 15px; }
        
        textarea.auto-expand { 
            background: #FAFAFA; 
            border: 1px solid #CBD5E1; 
            border-radius: 4px; 
            padding: 15px; 
            font-size: 14px; 
            width: 100%; 
            box-sizing: border-box; 
            resize: none; 
            overflow-y: hidden; 
            min-height: 100px; 
            color: var(--text-dark); 
            font-family: 'Roboto', sans-serif;
            transition: 0.2s;
        }
        textarea.auto-expand:focus { outline: none; border-color: var(--primary-blue); background: #fff; }

        /* Compact Video Style File Upload */
        .upload-badge {
            display: inline-block;
            background: #475569;
            color: #fff;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .compact-upload {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #FAFAFA;
            border: 1px dashed #CBD5E1;
            border-radius: 4px;
            padding: 15px;
            cursor: pointer;
            transition: 0.2s;
            margin-bottom: 10px;
            justify-content: center;
        }
        .compact-upload i { color: var(--text-gray); font-size: 18px; }
        .upload-text-small { font-size: 14px; color: var(--text-gray); }
        .file-selected-text { font-size: 13px; font-weight: 500; color: var(--success-green); margin-left: auto; display: none; }

        /* Error Styling */
        .error-border { border-color: var(--danger-red) !important; }
        .error-msg { color: var(--danger-red); font-size: 12px; font-weight: 500; display: block; margin-top: 5px; }

        /* Submit / Cancel Buttons */
        .footer-buttons { 
            display: flex; 
            gap: 10px; 
            margin-top: 25px; 
        }
        .btn-cancel { 
            background: #F1F5F9; 
            color: var(--text-dark); 
            font-weight: 500; 
            font-size: 14px; 
            border: 1px solid var(--border-color); 
            padding: 12px; 
            border-radius: 4px; 
            cursor: pointer; 
            text-decoration: none; 
            text-align: center;
            flex: 1;
        }
        .btn-submit { 
            background: var(--success-green); 
            color: #fff; 
            font-weight: 500; 
            font-size: 14px; 
            border: none; 
            padding: 12px; 
            border-radius: 4px; 
            cursor: pointer; 
            text-align: center;
            flex: 1;
        }
        .btn-cancel:hover { background: #E2E8F0; }
        .btn-submit:hover { opacity: 0.9; }

        .back-link {
            display: inline-block;
            margin-bottom: 10px;
            color: var(--text-gray);
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
        }
        .back-link i { margin-right: 5px; }
    </style>
</head>
<body>

<div class="submit-page-container">
    
    <a href="find_job.php" class="back-link"><i class="fa fa-arrow-left"></i> Back to Jobs</a>

    <!-- Top Card (Done / Earning) -->
    <div class="card">
        <div class="progress-header">
            <div>
                <div class="progress-title">DONE</div>
                <div class="progress-count"><?php echo $filled; ?> of <?php echo $target; ?></div>
            </div>
            <div class="check-circle">
                <i class="fa fa-check"></i>
            </div>
        </div>
        
        <div class="earning-section">
            <div class="earn-title">You Can Earn</div>
            <div class="earn-amount"><?php echo number_format($job['worker_earning'], 3); ?></div>
            <div class="job-id-badge">
                <i class="fa fa-briefcase"></i> JOB ID <?php echo $job_id; ?>
            </div>
            <div class="last-updated">
                Success Rate: <?php echo $emp_rating; ?>% &bull; Auto Approval: <?php echo $job['auto_approval_days']; ?> Days
            </div>
        </div>
    </div>

    <!-- Disclaimer Card (Matching Video Vibe) -->
    <div class="disclaimer-card">
        <span>Disclaimer :</span> This platform acts as a bridge. Please read instructions carefully and submit accurate proofs. We maintain strict policies against fake proof submissions. Ensure you follow all guidelines.
    </div>

    <!-- Job Title & Meta Card -->
    <div class="card">
        <div class="job-title-row">
            <h1 class="job-title">
                <?php echo htmlspecialchars($job['job_title']); ?>
                <i class="fa fa-check-square"></i>
            </h1>
        </div>

        <ul class="meta-list">
            <li><i class="fa fa-globe"></i> International</li>
            <li><i class="fa fa-folder-open"></i> <?php echo htmlspecialchars($job['category']); ?></li>
            <li><i class="fa fa-user"></i> Employer: <?php echo htmlspecialchars($job['emp_name']); ?></li>
        </ul>

        <!-- Re-integrated action buttons discreetly to not break logic -->
        <div class="actions-mini-row">
            <button class="btn-mini" onclick="handleJobAction('block')"><i class="fa fa-ban"></i> Block</button>
            <button id="followBtn" class="btn-mini" onclick="handleJobAction('follow')">
                <i class="fa <?php echo $is_following ? 'fa-check' : 'fa-plus'; ?>"></i> <?php echo $is_following ? 'Following' : 'Follow'; ?>
            </button>
            <a href="employer_profile.php?id=<?php echo $job['employer_id']; ?>" class="btn-mini"><i class="fa fa-eye"></i> Profile</a>
        </div>
    </div>

    <!-- Expected Work Card -->
    <div class="card">
        <h3 class="section-heading-blue">
            <i class="fa fa-list"></i> What is expected from workers?
        </h3>
        
        <div class="worker-expected-list">
            <?php foreach($steps as $i => $s): ?>
                <div class="step-item">
                    <span class="step-number"><?php echo $i+1; ?>.</span>
                    <span class="step-text"><?php echo nl2br(htmlspecialchars($s)); ?></span>
                </div>
            <?php endforeach; ?>
        </div>

        <!-- Video Style Report Button Placed exactly where it was in video -->
        <div class="report-btn-wrapper">
            <button id="reportBtn" class="btn-report-outline" onclick="handleJobAction('report')" <?php echo $is_reported ? 'disabled' : ''; ?>>
                <?php echo $is_reported ? 'Reported' : 'Report'; ?>
            </button>
        </div>
    </div>

    <!-- Proof Submission Card -->
    <form id="submissionForm" novalidate>
        <div class="card">
            <h3 class="section-heading-blue">REQUIRED PROOF THAT TASK WAS FINISHED?</h3>
            
            <div class="worker-expected-list mb-3">
                 <?php foreach($proofs as $i => $p): ?>
                    <div class="step-item mb-2" style="font-size: 14px;">
                        <span class="step-text"><?php echo htmlspecialchars($p['desc']); ?></span>
                    </div>
                <?php endforeach; ?>
            </div>

            <!-- Warning Box (Video Style) -->
            <div class="warning-box">
                <i class="fa fa-exclamation-triangle"></i>
                <div>Submit proper proofs according to instructions. If you Submit Fake Proof or Group Work then your Account will be permanently banned.</div>
            </div>

            <div class="submit-prove-heading">SUBMIT REQUIRED WORK PROVE <i class="fa fa-arrow-down"></i></div>
            
            <?php foreach($proofs as $i => $p): ?>
                <div class="proof-group">
                    <?php if($p['type'] == 'text'): ?>
                        <textarea class="auto-expand" name="proof_text[<?php echo $i; ?>]" placeholder="Prove Text Max Length is 2500 Character"></textarea>
                    
                    <?php else: ?>
                        <div class="upload-badge">#<?php echo ($i+1); ?> UPLOAD SCREENSHOT PROVE <i class="fa fa-upload"></i></div>
                        
                        <div class="compact-upload" onclick="this.querySelector('input').click()">
                            <i class="fa fa-image"></i>
                            <span class="upload-text-small">Tap to upload screenshot</span>
                            <span class="file-selected-text"></span>
                            <input type="file" name="proof_file_<?php echo $i; ?>" accept="image/*" style="display:none;" onchange="updateFileLabel(this)">
                        </div>
                        
                        <textarea class="auto-expand" style="min-height: 50px;" name="optional_comment_<?php echo $i; ?>" placeholder="Optional comment..."></textarea>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>

            <div class="footer-buttons">
                <?php if($is_revision): ?>
                    <button type="button" class="btn-cancel" onclick="deleteSubmission(<?php echo $existing['submission_id']; ?>)">DELETE</button>
                    <button type="submit" id="submitBtn" class="btn-submit">RESUBMIT WORK</button>
                <?php else: ?>
                    <a href="find_job.php" class="btn-cancel">CANCEL</a>
                    <button type="submit" id="submitBtn" class="btn-submit">SUBMIT PROOF</button>
                <?php endif; ?>
            </div>
        </div>
    </form>
    <br>
</div>

<!-- Scripts REMAIN 100% UNCHANGED to preserve your exact logic -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script>
$(document).on('input', 'textarea.auto-expand', function() {
    this.style.height = 'auto'; 
    this.style.height = (this.scrollHeight) + 'px'; 
    $(this).removeClass('error-border');
    $(this).parent().find('.error-msg').remove();
});

$(document).ready(function() {
    $('textarea.auto-expand').each(function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
});

function updateFileLabel(input) {
    if (input.files && input.files[0]) {
        let fileName = input.files[0].name;
        if(fileName.length > 20) fileName = fileName.substring(0, 20) + '...';
        
        let fileBox = $(input).siblings('.file-selected-text');
        fileBox.html('<i class="fa fa-check"></i> ' + fileName).show();
        $(input).siblings('.upload-text-small').hide();
        $(input).siblings('.fa-image').hide();
        $(input).closest('.compact-upload').removeClass('error-border');
        $(input).closest('.compact-upload').parent().find('.error-msg').remove();
    }
}

function deleteSubmission(subId) {
    Swal.fire({
        title: 'Delete Task?',
        text: "This slot will become free for others.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        confirmButtonText: 'Yes, Delete'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: 'delete_submission_handler.php',
                type: 'POST',
                data: { submission_id: subId },
                success: function(res) {
                    let r = JSON.parse(res);
                    if(r.status === 'success') { window.location.href = 'find_job.php'; } 
                    else { Swal.fire('Error', r.message, 'error'); }
                }
            });
        }
    });
}

function handleJobAction(type) {
    const empId = <?php echo $employer_id; ?>;
    const jobId = <?php echo $job_id; ?>;
    const workerId = <?php echo $worker_id; ?>;

    if(type === 'block') {
        Swal.fire({ title: 'Block Employer?', text: 'You will not see jobs from this employer anymore.', icon: 'warning', showCancelButton: true }).then((res) => {
            if(res.isConfirmed) ajaxAction({ action: 'block', employer_id: empId, worker_id: workerId });
        });
    } else if(type === 'follow') {
        ajaxAction({ action: 'follow', employer_id: empId, worker_id: workerId });
    } else if(type === 'report') {
        Swal.fire({ title: 'Report Job?', input: 'textarea', inputPlaceholder: 'Reason...', showCancelButton: true }).then((res) => {
            if(res.isConfirmed && res.value) ajaxAction({ action: 'report', job_id: jobId, reason: res.value, worker_id: workerId });
        });
    }
}

function ajaxAction(data) {
    $.post('actions_handler.php', data, function(res) {
        let r = JSON.parse(res);
        if(r.status === 'success') {
            if(data.action === 'block') window.location.href = 'find_job.php';
            if(data.action === 'follow') $('#followBtn').html(r.following ? '<i class="fa fa-check"></i> Following' : '<i class="fa fa-plus"></i> Follow');
            if(data.action === 'report') $('#reportBtn').attr('disabled', true).html('Reported');
            Swal.fire('Success', r.message, 'success');
        } else { Swal.fire('Alert', r.message, 'info'); }
    });
}

$('#submissionForm').on('submit', function(e) {
    e.preventDefault();
    let hasError = false;
    $('.error-border').removeClass('error-border');
    $('.error-msg').remove();

    $(this).find('textarea[name^="proof_text"]').each(function() {
        if (!$(this).val().trim()) {
            $(this).addClass('error-border');
            $(this).parent().append('<span class="error-msg">Required</span>');
            hasError = true;
        }
    });

    $(this).find('input[type="file"]').each(function() {
        if ($(this).get(0).files.length === 0) {
            $(this).closest('.compact-upload').addClass('error-border');
            $(this).parent().append('<span class="error-msg">File Required</span>');
            hasError = true;
        }
    });

    if (hasError) return false;

    $('#submitBtn').prop('disabled', true).text('PROCESSING...');
    $.ajax({
        url: 'submit_handler.php',
        type: 'POST',
        data: new FormData(this),
        processData: false,
        contentType: false,
        success: function(res) {
            let response = JSON.parse(res);
            if(response.status === 'success') {
                Swal.fire({ icon: 'success', title: 'Success!' }).then(() => { window.location.href = 'find_job.php'; });
            } else {
                Swal.fire('Error', response.message, 'error');
                $('#submitBtn').prop('disabled', false).text('<?php echo $is_revision ? "RESUBMIT WORK" : "SUBMIT PROOF"; ?>');
            }
        }
    });
});
</script>
<?php include 'footer.php'; ?>
</body>
</html>
