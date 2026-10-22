/**
 * PRATIKSHYA FASHION — Employee Loyalty Rewards
 *
 * Visible only to employees with the `instagram_reward.manage` permission.
 * Allows reviewing, approving, rejecting, and manually issuing customer
 * loyalty reward submissions. Shares the same API layer as the admin view.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmployeePage from "../../components/employee/EmployeePage";
import { AtelierButton, AtelierBadge, EmptyState } from "../../design-system";
import {
  apiAdminListInstagramRewards,
  apiAdminGetInstagramRewardDetail,
  apiAdminApproveInstagramReward,
  apiAdminRejectInstagramReward,
  apiAdminReopenInstagramReward,
  apiAdminManualClaimInstagramReward,
} from "../../services/api/instagramRewardsApi";
import { employeeInputClass } from "../../components/employee/EmployeeField";
import {
  Camera,
  ExternalLink,
  Copy,
  Check,
  Eye,
  Pencil,
  Search,
  UserPlus,
  Gift,
} from "lucide-react";

function formatDate(isoStr) {
  if (!isoStr) return "N/A";
  try {
    return new Date(isoStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(isoStr);
  }
}

export default function EmployeeLoyaltyRewards() {
  const [rewards, setRewards] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_LIMIT = 20;

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  // Detail drawer
  const [selectedReward, setSelectedReward] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Approve modal
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [approveNotes, setApproveNotes] = useState("");
  const [approveDiscount, setApproveDiscount] = useState("");
  const [approveMinOrder, setApproveMinOrder] = useState("");

  // Reject modal
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Manual claim modal
  const [isManualClaimOpen, setIsManualClaimOpen] = useState(false);
  const [manualClaimForm, setManualClaimForm] = useState({
    customerIdentifier: "",
    orderIdentifier: "",
    notes: "",
    autoApprove: true,
    discountPercentage: "",
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedCoupon, setGeneratedCoupon] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Edit coupon modal
  const [isEditCouponOpen, setIsEditCouponOpen] = useState(false);
  const [editCouponReward, setEditCouponReward] = useState(null);
  const [editDiscount, setEditDiscount] = useState("");
  const [editMinOrder, setEditMinOrder] = useState("");

  // Load rewards
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiAdminListInstagramRewards({
      status: statusFilter,
      search: searchQuery,
      page: currentPage,
      limit: PAGE_LIMIT,
    }).then((res) => {
      if (cancelled) return;
      setIsLoading(false);
      if (res.ok) {
        setRewards(res.items ?? []);
        setTotal(res.total ?? (res.items ?? []).length);
        setTotalPages(res.totalPages ?? 1);
        setError(null);
      } else {
        setRewards([]);
        setError(res.error ?? "Failed to load loyalty rewards.");
      }
    });
    return () => { cancelled = true; };
  }, [statusFilter, searchQuery, currentPage, attempt]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, searchQuery]);

  const pendingCount = useMemo(() => rewards.filter((r) => r.status === "PENDING").length, [rewards]);
  const approvedCount = useMemo(() => rewards.filter((r) => r.status === "APPROVED").length, [rewards]);

  const handleOpenDetail = async (reward) => {
    setSelectedReward(reward);
    setIsDetailOpen(true);
    const res = await apiAdminGetInstagramRewardDetail(reward.id);
    if (res.ok && res.reward) setSelectedReward(res.reward);
  };

  const handleOpenApproveModal = (reward) => {
    setSelectedReward(reward);
    setApproveNotes("");
    setApproveDiscount("");
    setApproveMinOrder("");
    setIsApproveOpen(true);
  };

  const handleOpenRejectModal = (reward) => {
    setSelectedReward(reward);
    setRejectReason("");
    setIsRejectOpen(true);
  };

  const handleConfirmApproval = async () => {
    if (!selectedReward || isProcessing) return;
    if (!approveDiscount || parseFloat(approveDiscount) <= 0 || parseFloat(approveDiscount) > 100) {
      alert("Please enter a valid discount percentage between 1 and 100.");
      return;
    }
    setIsProcessing(true);
    const res = await apiAdminApproveInstagramReward(
      selectedReward.id,
      approveNotes,
      parseFloat(approveDiscount),
      approveMinOrder !== "" ? parseFloat(approveMinOrder) : 0,
    );
    setIsProcessing(false);
    if (res.ok) {
      setIsApproveOpen(false);
      const couponCode = res.reward?.couponCode || res.reward?.coupon?.code;
      setGeneratedCoupon({
        code: couponCode,
        discountPercentage: res.reward?.coupon?.discountPercentage ?? 10,
        customerName: res.reward?.customerName,
      });
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to approve reward submission.");
    }
  };

  const handleConfirmRejection = async () => {
    if (!selectedReward || isProcessing) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 3) {
      alert("Please provide a rejection reason of at least 3 characters.");
      return;
    }
    setIsProcessing(true);
    const res = await apiAdminRejectInstagramReward(selectedReward.id, rejectReason.trim());
    setIsProcessing(false);
    if (res.ok) {
      setIsRejectOpen(false);
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to reject reward submission.");
    }
  };

  const handleReopen = async (reward) => {
    if (!window.confirm("Re-open this rejected reward back to Pending?")) return;
    setIsProcessing(true);
    const res = await apiAdminReopenInstagramReward(reward.id);
    setIsProcessing(false);
    if (res.ok) {
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to re-open reward.");
    }
  };

  const handleManualClaim = async () => {
    const { customerIdentifier, orderIdentifier } = manualClaimForm;
    if (!customerIdentifier.trim() || !orderIdentifier.trim()) {
      alert("Please provide both Customer (ID or Email) and Order (ID or Number).");
      return;
    }
    setIsProcessing(true);
    const res = await apiAdminManualClaimInstagramReward({
      customerIdentifier: customerIdentifier.trim(),
      orderIdentifier: orderIdentifier.trim(),
      notes: manualClaimForm.notes.trim() || "Manual staff entry",
      autoApprove: manualClaimForm.autoApprove,
      discountPercentage: manualClaimForm.discountPercentage !== "" ? parseFloat(manualClaimForm.discountPercentage) : undefined,
    });
    setIsProcessing(false);
    if (res.ok) {
      setIsManualClaimOpen(false);
      setManualClaimForm({ customerIdentifier: "", orderIdentifier: "", notes: "", autoApprove: true, discountPercentage: "" });
      if (res.reward?.couponCode) {
        setGeneratedCoupon({
          code: res.reward.couponCode,
          discountPercentage: res.reward.coupon?.discountPercentage ?? 10,
          customerName: res.reward.customerName,
        });
      }
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to create manual reward claim.");
    }
  };

  const handleCopyCouponCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleOpenEditCoupon = (reward) => {
    setEditCouponReward(reward);
    setEditDiscount(reward.coupon?.discountPercentage ?? "");
    setEditMinOrder("");
    setIsEditCouponOpen(true);
  };

  // Re-approve with new discount to effectively update the coupon
  const handleConfirmEditCoupon = async () => {
    if (!editCouponReward || isProcessing) return;
    if (!editDiscount || parseFloat(editDiscount) <= 0 || parseFloat(editDiscount) > 100) {
      alert("Please enter a valid discount percentage between 1 and 100.");
      return;
    }
    setIsProcessing(true);
    const res = await apiAdminApproveInstagramReward(
      editCouponReward.id,
      "Coupon updated by staff",
      parseFloat(editDiscount),
      editMinOrder !== "" ? parseFloat(editMinOrder) : 0,
    );
    setIsProcessing(false);
    if (res.ok) {
      setIsEditCouponOpen(false);
      const couponCode = res.reward?.couponCode || res.reward?.coupon?.code;
      setGeneratedCoupon({
        code: couponCode,
        discountPercentage: res.reward?.coupon?.discountPercentage ?? parseFloat(editDiscount),
        customerName: res.reward?.customerName,
      });
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to update coupon.");
    }
  };

  return (
    <EmployeePage
      eyebrow="Loyalty Rewards"
      title={
        <>
          Customer <span className="italic text-accent">rewards.</span>
        </>
      }
      description="Review, approve, and issue loyalty reward coupons for customer submissions."
      actions={
        <div className="flex gap-2">
          <AtelierButton size="chip" onClick={() => setIsManualClaimOpen(true)}>
            <UserPlus size={13} aria-hidden="true" /> Add Manual Reward
          </AtelierButton>
          {error && (
            <AtelierButton size="chip" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </AtelierButton>
          )}
        </div>
      }
    >
      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-3">
        {[
          { label: "Pending", value: pendingCount },
          { label: "Approved", value: approvedCount },
          { label: "Total", value: total },
        ].map(({ label, value }) => (
          <div key={label} className="border border-mist bg-surface p-4">
            <p className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">{label}</p>
            <p className="mt-1 font-display text-2xl font-light text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search rewards</span>
          <Search className="absolute left-3 top-3 text-taupe" size={15} aria-hidden="true" />
          <input
            className={`${employeeInputClass()} pl-9`}
            placeholder="Search handle, order ID, or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by status"
          className={employeeInputClass()}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center font-ui text-xs text-taupe animate-pulse">
          Loading loyalty rewards...
        </div>
      ) : error ? (
        <EmptyState
          eyebrow="Connection error"
          title="Submissions could not be loaded"
          description={error}
        />
      ) : rewards.length === 0 ? (
        <EmptyState
          eyebrow="Loyalty Rewards"
          title="No reward submissions found"
          description="Submissions will appear here once customers request loyalty rewards."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-mist font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Handle</th>
                <th className="py-3 px-3">Order</th>
                <th className="py-3 px-3">Submitted</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Discount</th>
                <th className="py-3 px-3">Eligibility</th>
                <th className="py-3 px-3">Coupon</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pearl/60">
              {rewards.map((reward) => (
                <tr key={reward.id} className="hover:bg-surface/40 transition-colors">
                  <td className="py-3 px-3">
                    <div className="font-ui text-xs font-medium text-ink">{reward.customerName}</div>
                    <div className="font-ui text-[10px] text-taupe">{reward.customerEmail}</div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 font-ui text-xs text-ink">
                      <Camera className="w-3.5 h-3.5 text-rose-500" />
                      @{reward.instagramUsername}
                    </div>
                    {reward.instagramPostUrl && (
                      <a
                        href={reward.instagramPostUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-0.5"
                      >
                        View post <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs text-ink">{reward.orderNumber}</td>
                  <td className="py-3 px-3 font-ui text-xs text-taupe">{formatDate(reward.createdAt)}</td>
                  <td className="py-3 px-3">
                    {reward.status === "APPROVED" && <AtelierBadge variant="success">Approved</AtelierBadge>}
                    {reward.status === "PENDING" && <AtelierBadge variant="warning">Pending</AtelierBadge>}
                    {reward.status === "REJECTED" && <AtelierBadge variant="error">Rejected</AtelierBadge>}
                  </td>
                  {/* Discount */}
                  <td className="py-3 px-3 font-ui text-xs text-ink">
                    {reward.coupon?.discountPercentage ? `${reward.coupon.discountPercentage}% OFF` : "—"}
                  </td>
                  {/* Eligibility */}
                  <td className="py-3 px-3 font-ui text-xs text-taupe">
                    {reward.couponCode ? "Single-use" : "—"}
                  </td>
                  <td className="py-3 px-3 font-mono text-xs">
                    {reward.couponCode ? (
                      <span className="bg-emerald-50 text-emerald-700 px-2 py-1 border border-emerald-200 font-bold">
                        {reward.couponCode}
                      </span>
                    ) : (
                      <span className="text-taupe">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenDetail(reward)}
                        className="p-1.5 text-taupe hover:text-ink transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {reward.status === "APPROVED" && reward.couponCode && (
                        <button
                          onClick={() => handleOpenEditCoupon(reward)}
                          className="p-1.5 text-taupe hover:text-ink transition-colors"
                          title="Edit Coupon"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {reward.status === "PENDING" && (
                        <>
                          <AtelierButton size="chip" variant="primary" onClick={() => handleOpenApproveModal(reward)}>
                            Approve
                          </AtelierButton>
                          <AtelierButton size="chip" variant="outline" onClick={() => handleOpenRejectModal(reward)}>
                            Reject
                          </AtelierButton>
                        </>
                      )}
                      {reward.status === "REJECTED" && (
                        <AtelierButton size="chip" variant="outline" onClick={() => handleReopen(reward)} disabled={isProcessing}>
                          Re-open
                        </AtelierButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-pearl font-ui text-xs text-taupe">
          <span>{total} total submissions</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-pearl disabled:opacity-40 hover:bg-surface"
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-pearl disabled:opacity-40 hover:bg-surface"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Generated Coupon Toast ── */}
      {generatedCoupon && (
        <div className="fixed bottom-6 right-6 z-50 bg-canvas border border-mist shadow-xl p-5 w-80">
          <div className="flex items-center gap-2 mb-3">
            <Gift className="w-4 h-4 text-accent" />
            <span className="font-ui text-xs font-medium text-ink">Coupon Issued</span>
          </div>
          <p className="font-ui text-[11px] text-taupe mb-2">
            {generatedCoupon.customerName} — {generatedCoupon.discountPercentage}% OFF
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 font-mono text-sm font-bold text-ink bg-surface border border-mist px-3 py-1.5">
              {generatedCoupon.code}
            </span>
            <button
              onClick={() => handleCopyCouponCode(generatedCoupon.code)}
              className="p-2 text-taupe hover:text-ink transition-colors border border-mist"
              title="Copy code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={() => setGeneratedCoupon(null)}
            className="mt-3 w-full font-ui text-[10px] uppercase tracking-widest text-taupe hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Detail Drawer ── */}
      {isDetailOpen && selectedReward && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-lg bg-canvas h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-mist pb-4 mb-6">
                <h3 className="font-display text-xl font-light text-ink">Reward Detail</h3>
                <button onClick={() => setIsDetailOpen(false)} className="text-taupe hover:text-ink p-1">✕</button>
              </div>
              <div className="space-y-5 font-ui text-xs">
                {/* Status */}
                <div className="flex justify-between items-center p-3 bg-surface border border-mist">
                  <span className="text-[10px] uppercase tracking-[.14em] text-taupe">Status</span>
                  {selectedReward.status === "APPROVED" && <AtelierBadge variant="success">Approved</AtelierBadge>}
                  {selectedReward.status === "PENDING" && <AtelierBadge variant="warning">Pending Review</AtelierBadge>}
                  {selectedReward.status === "REJECTED" && <AtelierBadge variant="error">Rejected</AtelierBadge>}
                </div>
                {/* Customer */}
                <div>
                  <h4 className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-2">Customer</h4>
                  <div className="bg-surface p-3 border border-mist space-y-1">
                    <div className="font-medium text-ink">{selectedReward.customerName}</div>
                    <div className="text-[10px] text-taupe">{selectedReward.customerEmail}</div>
                  </div>
                </div>
                {/* Submission */}
                <div>
                  <h4 className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-2">Submission</h4>
                  <div className="bg-surface p-3 border border-mist space-y-2">
                    <div className="flex justify-between">
                      <span className="text-taupe">Handle:</span>
                      <span className="font-medium text-ink">@{selectedReward.instagramUsername}</span>
                    </div>
                    {selectedReward.instagramPostUrl && (
                      <div className="flex justify-between items-center">
                        <span className="text-taupe">Post:</span>
                        <a href={selectedReward.instagramPostUrl} target="_blank" rel="noreferrer"
                          className="text-accent underline flex items-center gap-1 text-[10px]">
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-taupe">Submitted:</span>
                      <span className="text-ink">{formatDate(selectedReward.createdAt)}</span>
                    </div>
                  </div>
                </div>
                {/* Order */}
                <div>
                  <h4 className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-2">Order</h4>
                  <div className="bg-surface p-3 border border-mist">
                    <span className="font-mono font-medium text-ink">#{selectedReward.orderNumber}</span>
                  </div>
                </div>
                {/* Coupon */}
                {selectedReward.couponCode && (
                  <div>
                    <h4 className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-2">Coupon</h4>
                    <div className="bg-emerald-50 border border-emerald-200 p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-ui text-[10px] uppercase tracking-[.12em] text-emerald-800">Code</span>
                        <span className="font-mono font-bold text-emerald-900 bg-white px-2 py-1 border border-emerald-300">
                          {selectedReward.couponCode}
                        </span>
                      </div>
                      {selectedReward.coupon && (
                        <div className="flex justify-between font-ui text-[10px] text-emerald-800">
                          <span>Discount:</span>
                          <span className="font-medium">{selectedReward.coupon.discountPercentage}% OFF</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Audit */}
                {selectedReward.verifiedBy && (
                  <div>
                    <h4 className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-2">Verification</h4>
                    <div className="bg-surface p-3 border border-mist space-y-1 text-[10px]">
                      <div><span className="text-taupe">By:</span> <span className="font-medium text-ink">{selectedReward.verifierName || selectedReward.verifiedBy}</span></div>
                      <div><span className="text-taupe">At:</span> <span className="text-ink">{formatDate(selectedReward.verifiedAt)}</span></div>
                      {selectedReward.rejectionReason && (
                        <div className="mt-2 text-rose-700 bg-rose-50 p-2 border border-rose-200">
                          <span className="font-medium">Reason:</span> {selectedReward.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="pt-6 border-t border-mist flex justify-end gap-3">
              <AtelierButton variant="outline" onClick={() => setIsDetailOpen(false)}>Close</AtelierButton>
              {selectedReward.status === "PENDING" && (
                <>
                  <AtelierButton variant="outline" onClick={() => { setIsDetailOpen(false); handleOpenRejectModal(selectedReward); }}>
                    Reject
                  </AtelierButton>
                  <AtelierButton variant="primary" onClick={() => { setIsDetailOpen(false); handleOpenApproveModal(selectedReward); }}>
                    Approve
                  </AtelierButton>
                </>
              )}
              {selectedReward.status === "REJECTED" && (
                <AtelierButton variant="outline" onClick={() => { setIsDetailOpen(false); handleReopen(selectedReward); }} disabled={isProcessing}>
                  Re-open
                </AtelierButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve Modal ── */}
      {isApproveOpen && selectedReward && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-xl border border-mist">
            <h3 className="font-display text-lg font-light text-ink mb-2">Approve Reward?</h3>
            <p className="font-ui text-xs text-taupe mb-4">
              Approve for <strong>@{selectedReward.instagramUsername}</strong> on order <strong>#{selectedReward.orderNumber}</strong>.
            </p>
            <div className="mb-4">
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-1">
                Discount % <span className="text-accent">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={approveDiscount}
                onChange={(e) => setApproveDiscount(e.target.value)}
                placeholder="e.g. 10"
                className={employeeInputClass()}
              />
            </div>
            <div className="mb-4">
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-1">
                Min. Order Value (₹, optional)
              </label>
              <input
                type="number"
                min="0"
                value={approveMinOrder}
                onChange={(e) => setApproveMinOrder(e.target.value)}
                placeholder="0"
                className={employeeInputClass()}
              />
            </div>
            <div className="mb-5">
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-1">Notes (optional)</label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                rows={2}
                className={employeeInputClass()}
                placeholder="Internal note..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <AtelierButton variant="outline" onClick={() => setIsApproveOpen(false)} disabled={isProcessing}>Cancel</AtelierButton>
              <AtelierButton variant="primary" onClick={handleConfirmApproval} disabled={isProcessing}>
                {isProcessing ? "Approving..." : "Confirm & Issue Coupon"}
              </AtelierButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ── */}
      {isRejectOpen && selectedReward && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-xl border border-mist">
            <h3 className="font-display text-lg font-light text-ink mb-2">Reject Reward?</h3>
            <p className="font-ui text-xs text-taupe mb-4">
              Rejecting submission from <strong>@{selectedReward.instagramUsername}</strong>.
            </p>
            <div className="mb-5">
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-1">
                Rejection Reason <span className="text-accent">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className={employeeInputClass()}
                placeholder="Reason for rejection..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <AtelierButton variant="outline" onClick={() => setIsRejectOpen(false)} disabled={isProcessing}>Cancel</AtelierButton>
              <AtelierButton variant="primary" onClick={handleConfirmRejection} disabled={isProcessing}>
                {isProcessing ? "Rejecting..." : "Confirm Rejection"}
              </AtelierButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Claim Modal ── */}
      {isManualClaimOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-xl border border-mist">
            <h3 className="font-display text-lg font-light text-ink mb-2">Add Manual Reward</h3>
            <p className="font-ui text-xs text-taupe mb-4">
              Manually issue a loyalty reward coupon for a customer.
            </p>
            {[
              { label: "Customer (ID or Email)", key: "customerIdentifier", placeholder: "customer@email.com" },
              { label: "Order (ID or Number)", key: "orderIdentifier", placeholder: "PF-ORD-XXXXX" },
              { label: "Discount %", key: "discountPercentage", placeholder: "e.g. 10", type: "number" },
              { label: "Notes (optional)", key: "notes", placeholder: "Manual staff entry" },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key} className="mb-3">
                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-1">{label}</label>
                <input
                  type={type || "text"}
                  value={manualClaimForm[key]}
                  onChange={(e) => setManualClaimForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={employeeInputClass()}
                />
              </div>
            ))}
            <label className="flex items-center gap-2 font-ui text-xs text-ink mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={manualClaimForm.autoApprove}
                onChange={(e) => setManualClaimForm((f) => ({ ...f, autoApprove: e.target.checked }))}
                className="accent-accent"
              />
              Auto-approve and issue coupon immediately
            </label>
            <div className="flex justify-end gap-3">
              <AtelierButton variant="outline" onClick={() => setIsManualClaimOpen(false)} disabled={isProcessing}>Cancel</AtelierButton>
              <AtelierButton variant="primary" onClick={handleManualClaim} disabled={isProcessing}>
                {isProcessing ? "Creating..." : "Create Reward"}
              </AtelierButton>
            </div>
          </div>
        </div>
      )}
      {/* ── Edit Coupon Modal ── */}
      {isEditCouponOpen && editCouponReward && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-xl border border-mist">
            <h3 className="font-display text-lg font-light text-ink mb-2">Edit Coupon</h3>
            <p className="font-ui text-xs text-taupe mb-1">
              Coupon: <span className="font-mono font-bold text-ink">{editCouponReward.couponCode}</span>
            </p>
            <p className="font-ui text-xs text-taupe mb-4">
              Customer: <strong>{editCouponReward.customerName}</strong>
            </p>
            <div className="mb-4">
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-1">
                New Discount % <span className="text-accent">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={editDiscount}
                onChange={(e) => setEditDiscount(e.target.value)}
                placeholder="e.g. 15"
                className={employeeInputClass()}
              />
            </div>
            <div className="mb-5">
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe mb-1">
                Min. Order Value (₹, optional)
              </label>
              <input
                type="number"
                min="0"
                value={editMinOrder}
                onChange={(e) => setEditMinOrder(e.target.value)}
                placeholder="0"
                className={employeeInputClass()}
              />
            </div>
            <div className="flex justify-end gap-3">
              <AtelierButton variant="outline" onClick={() => setIsEditCouponOpen(false)} disabled={isProcessing}>
                Cancel
              </AtelierButton>
              <AtelierButton variant="primary" onClick={handleConfirmEditCoupon} disabled={isProcessing}>
                {isProcessing ? "Updating..." : "Update Coupon"}
              </AtelierButton>
            </div>
          </div>
        </div>
      )}
    </EmployeePage>
  );
}
