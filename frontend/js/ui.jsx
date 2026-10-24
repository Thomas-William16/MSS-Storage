// Stable public UI API. Implementations depend on leaf modules, never this facade.
export {
  Badge,
  Link,
  Actions,
  Header,
  Panel,
  Availability,
  Table,
  Loading,
  ErrorMessage,
} from "./ui/primitives.jsx";
export { Button } from "./ui/Button.jsx";
export { Dialog } from "./ui/Dialog.jsx";
export { Form, Field } from "./ui/forms.jsx";
export { UIProvider } from "./ui/provider.jsx";
export { useUI } from "./ui/context.js";
export { Pager, PagedList } from "./ui/PagedList.jsx";
export { useResource, useReload } from "./hooks/resource.js";
export { useListState, useRestoreScroll } from "./hooks/navigation.js";
export { fmt, short, opts, inputDate, iso } from "./utils/format.js";
