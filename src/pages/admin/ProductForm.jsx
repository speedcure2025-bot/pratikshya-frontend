/**
 * /admin/products/new · /admin/products/:productId/edit
 *
 * Super Admin and Admin share this page with permitted employees —
 * same Quick Create / full editor. Admin can later Approve & publish
 * a product they created themselves.
 */

import { useParams } from "react-router-dom";
import AdminPage from "../../components/admin/AdminPage";
import ProductCreateWorkspace, {
  productCreateDescription,
  productCreateTitle,
  useProductCreateFlow,
} from "../../components/products/ProductCreateWorkspace";
import { useAdminAuth } from "../../context/AdminAuthContext";

export default function ProductForm() {
  const { productId } = useParams();
  const { admin } = useAdminAuth();
  const useQuick = useProductCreateFlow(productId);

  const actor = admin
    ? { id: admin.id, adminId: admin.adminId, name: admin.name || admin.fullName || "Administrator" }
    : null;

  return (
    <AdminPage
      eyebrow="Business / Products"
      title={productCreateTitle(productId, useQuick)}
      description={productCreateDescription(useQuick)}
    >
      <ProductCreateWorkspace
        productId={productId}
        portal="admin"
        actor={actor}
        canPublish
        exitTo="/admin/products"
      />
    </AdminPage>
  );
}
