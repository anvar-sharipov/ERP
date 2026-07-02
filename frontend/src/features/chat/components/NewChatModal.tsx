// frontend/src/features/chat/components/NewChatModal.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { conversationApi } from "../services/chatApi";
import { Modal } from "../../../components/ui/Modal/Modal";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { useUser } from "../../../core/context/UserContext";
import { api } from "../../../core/api/axiosInstance";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (convId: number) => void;
}

const getFullName = (u: any) => `${u.first_name} ${u.last_name}`.trim() || u.username;

export const NewChatModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const { t } = useTranslation();
  const { user } = useUser();
  const qc = useQueryClient();

  const [type, setType] = useState<"direct" | "group">("direct");
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data: users = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await api.get("/users/list/")).data,
    enabled: isOpen,
  });

  const filtered = users.filter((u: any) => u.id !== user?.id && getFullName(u).toLowerCase().includes(search.toLowerCase()));

  const toggleUser = (id: number) => {
    if (type === "direct") {
      setSelectedIds([id]);
      return;
    }
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      conversationApi.create({
        type,
        name: type === "group" ? groupName : undefined,
        participant_ids: selectedIds,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onCreated(res.data.id);
      handleClose();
    },
  });

  const handleClose = () => {
    setType("direct");
    setGroupName("");
    setSearch("");
    setSelectedIds([]);
    onClose();
  };

  const canSubmit = selectedIds.length > 0 && (type === "direct" || (type === "group" && groupName.trim()));

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t("Title")} closeOnOutsideClick={false}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["direct", "group"] as const).map((tType) => (
            <button
              key={tType}
              onClick={() => {
                setType(tType);
                setSelectedIds([]);
              }}
              className={`
                flex-1 py-2 rounded-lg text-sm font-medium transition-all
                ${type === tType ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}
              `}
            >
              {tType === "direct" ? t("Direct") : t("Group")}
            </button>
          ))}
        </div>

        {type === "group" && <Input label={t("GroupName")} value={groupName} onChange={(e) => setGroupName(e.target.value)} />}

        <Input label={type === "direct" ? t("SelectUser") : t("AddParticipants")} placeholder={t("Search")} value={search} onChange={(e) => setSearch(e.target.value)} />

        <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-700/50">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">{t("NoUsersFound")}</div>
          ) : (
            filtered.map((u: any) => {
              const isSelected = selectedIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => toggleUser(u.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all
                    ${isSelected ? "bg-indigo-600/20 text-indigo-200" : "text-slate-200 hover:bg-slate-700/50"}
                  `}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? "bg-indigo-600" : "bg-slate-600"}`}>
                    {getFullName(u).slice(0, 2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{getFullName(u)}</div>
                    <div className="text-xs text-slate-400 truncate">{u.username}</div>
                  </div>

                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {type === "group" && selectedIds.length > 0 && <div className="text-xs text-indigo-400">{t("Selected", { count: selectedIds.length })}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button text={t("Cancel")} onClick={handleClose} />
          <Button text={createMutation.isPending ? t("Creating") : t("Create")} variant="danger" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()} />
        </div>
      </div>
    </Modal>
  );
};

// // frontend/src/features/chat/components/NewChatModal.tsx
// import { useState } from "react";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { conversationApi } from "../services/chatApi";
// import { Modal } from "../../../components/ui/Modal/Modal";
// import { Input } from "../../../components/ui/Input";
// import { Button } from "../../../components/ui/Button";
// import { useUser } from "../../../core/context/UserContext";
// import { api } from "../../../core/api/axiosInstance";

// interface Props {
//   isOpen: boolean;
//   onClose: () => void;
//   onCreated: (convId: number) => void;
//   t: (key: string, params?: Record<string, any>) => string;
// }

// const getFullName = (u: any) => `${u.first_name} ${u.last_name}`.trim() || u.username;

// export const NewChatModal: React.FC<Props> = ({ isOpen, onClose, onCreated, t }) => {
//   const { user } = useUser();
//   const qc = useQueryClient();

//   const [type, setType] = useState<"direct" | "group">("direct");
//   const [groupName, setGroupName] = useState("");
//   const [search, setSearch] = useState("");
//   const [selectedIds, setSelectedIds] = useState<number[]>([]);

//   const { data: users = [] } = useQuery({
//     queryKey: ["users-list"],
//     queryFn: async () => (await api.get("/users/list/")).data,
//     enabled: isOpen,
//   });

//   const filtered = users.filter((u: any) => u.id !== user?.id && getFullName(u).toLowerCase().includes(search.toLowerCase()));

//   const toggleUser = (id: number) => {
//     if (type === "direct") {
//       setSelectedIds([id]);
//       return;
//     }
//     setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
//   };

//   const createMutation = useMutation({
//     mutationFn: () =>
//       conversationApi.create({
//         type,
//         name: type === "group" ? groupName : undefined,
//         participant_ids: selectedIds,
//       }),
//     onSuccess: (res) => {
//       qc.invalidateQueries({ queryKey: ["conversations"] });
//       onCreated(res.data.id);
//       handleClose();
//     },
//   });

//   const handleClose = () => {
//     setType("direct");
//     setGroupName("");
//     setSearch("");
//     setSelectedIds([]);
//     onClose();
//   };

//   const canSubmit = selectedIds.length > 0 && (type === "direct" || (type === "group" && groupName.trim()));

//   return (
//     <Modal isOpen={isOpen} onClose={handleClose} title={t("NewConversation.Title")} closeOnOutsideClick={false}>
//       <div className="space-y-4">
//         <div className="flex gap-2">
//           {(["direct", "group"] as const).map((tType) => (
//             <button
//               key={tType}
//               onClick={() => {
//                 setType(tType);
//                 setSelectedIds([]);
//               }}
//               className={`
//                 flex-1 py-2 rounded-lg text-sm font-medium transition-all
//                 ${type === tType ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}
//               `}
//             >
//               {tType === "direct" ? t("NewConversation.Direct") : t("NewConversation.Group")}
//             </button>
//           ))}
//         </div>

//         {type === "group" && <Input label={t("NewConversation.GroupName")} value={groupName} onChange={(e) => setGroupName(e.target.value)} />}

//         <Input
//           label={type === "direct" ? t("NewConversation.SelectUser") : t("NewConversation.AddParticipants")}
//           placeholder={t("NewConversation.Search")}
//           value={search}
//           onChange={(e) => setSearch(e.target.value)}
//         />

//         <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-700/50">
//           {filtered.length === 0 ? (
//             <div className="py-6 text-center text-slate-400 text-sm">{t("NewConversation.NoUsersFound")}</div>
//           ) : (
//             filtered.map((u: any) => {
//               const isSelected = selectedIds.includes(u.id);
//               return (
//                 <button
//                   key={u.id}
//                   onClick={() => toggleUser(u.id)}
//                   className={`
//                     w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all
//                     ${isSelected ? "bg-indigo-600/20 text-indigo-200" : "text-slate-200 hover:bg-slate-700/50"}
//                   `}
//                 >
//                   <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? "bg-indigo-600" : "bg-slate-600"}`}>
//                     {getFullName(u).slice(0, 2).toUpperCase()}
//                   </div>

//                   <div className="flex-1 min-w-0">
//                     <div className="text-sm font-medium truncate">{getFullName(u)}</div>
//                     <div className="text-xs text-slate-400 truncate">{u.username}</div>
//                   </div>

//                   {isSelected && (
//                     <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
//                       <svg viewBox="0 0 10 10" className="w-3 h-3" fill="none">
//                         <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
//                       </svg>
//                     </span>
//                   )}
//                 </button>
//               );
//             })
//           )}
//         </div>

//         {type === "group" && selectedIds.length > 0 && <div className="text-xs text-indigo-400">{t("NewConversation.Selected", { count: selectedIds.length })}</div>}

//         <div className="flex justify-end gap-2 pt-1">
//           <Button text={t("NewConversation.Cancel")} onClick={handleClose} />
//           <Button
//             text={createMutation.isPending ? t("NewConversation.Creating") : t("NewConversation.Create")}
//             variant="danger"
//             disabled={!canSubmit || createMutation.isPending}
//             onClick={() => createMutation.mutate()}
//           />
//         </div>
//       </div>
//     </Modal>
//   );
// };
