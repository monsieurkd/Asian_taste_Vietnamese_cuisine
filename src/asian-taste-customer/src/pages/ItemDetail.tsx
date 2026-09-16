import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCartStore } from '@/stores/cartStore';
import { useMenuIndex } from '@/hooks/useMenuIndex';
import { DishDetail, type DishSelection } from '@/components/menu/DishDetail';
import { Modal } from '@/components/ui/Modal';
import { Panel } from '@/components/ui/Panel';
import { StateBlock } from '@/components/ui/State';
import { StateIcons } from '@/components/ui/stateIcons';
import { showToast } from '@/stores/toastStore';

/**
 * `/menu/item/:slug` — the dish detail, as a modal over the catalog.
 *
 * `/cart/edit/:lineId` reaches the same screen, so editing a line does not need
 * a second implementation of the option picker. Both params resolve to one slug
 * before any hook runs, so the hook order is unconditional either way.
 */
export function ItemDetail() {
  const { slug, lineId } = useParams<{ slug?: string; lineId?: string }>();
  const navigate = useNavigate();
  const addConfigured = useCartStore((s) => s.addConfigured);
  const { index, isLoading: menuLoading } = useMenuIndex();

  const line = lineId
    ? useCartStore.getState().items.find((i) => i.id === lineId)
    : undefined;
  const resolvedSlug = slug ?? line?.slug;
  const dish = resolvedSlug ? index.bySlug.get(resolvedSlug) : undefined;
  const isLoading = menuLoading || (!dish && !!resolvedSlug);

  if (isLoading) {
    return (
      <Modal title="Loading dish">
        <div className="skeleton sk-img" />
        <div className="skeleton sk-line sk-title" style={{ marginTop: 20 }} />
        <div className="skeleton sk-line" style={{ marginTop: 10 }} />
        <div className="skeleton sk-line" style={{ marginTop: 10, width: '70%' }} />
      </Modal>
    );
  }

  if (!dish) {
    return (
      <Modal title="Dish not found">
        <StateBlock
          icon={StateIcons.search}
          title="We can't find that dish"
          body="It may have been renamed or taken off the menu. Everything else is still here."
          action={
            <Link to="/menu" className="btn btn-primary">
              Back to the menu
            </Link>
          }
        />
      </Modal>
    );
  }

  const handleAdd = (selection: DishSelection) => {
    addConfigured(dish, {
      selections: selection.selections,
      quantity: selection.quantity,
      note: selection.note,
    });
    showToast(`${dish.name} added to your order`);
    navigate('/menu');
  };

  return (
    <Modal title={dish.name} labelledBy="dish-detail-heading">
      <nav className="breadcrumb mb-5" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="sep">/</span>
        <Link to="/menu">Menu</Link>
        <span className="sep">/</span>
        <span aria-current="page">{dish.name}</span>
      </nav>
      <h2 id="dish-detail-heading" className="sr-only">
        {dish.name}
      </h2>
      <DishDetail dish={dish} onAdd={handleAdd} />
      <Panel className="mt-6">
        <div className="panel-body">
          <p className="helpline">
            Allergies or a change we should know about? Add it to the special instructions — the
            kitchen reads every one.
          </p>
        </div>
      </Panel>
    </Modal>
  );
}
