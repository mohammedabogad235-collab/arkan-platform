import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, Trash2, Edit2, Ban } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const safeMessages = Array.isArray(messages) ? messages : [];

  const fetchMessages = async () => {
    try {
      const res = await apiFetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [safeMessages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || loading) return;

    setLoading(true);
    try {
      const res = await apiFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMessage.trim() }),
      });

      if (res.ok) {
        setNewMessage("");
        fetchMessages();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "خطأ", description: data.error || "تعذر إرسال الرسالة" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ في الاتصال، حاول مرة أخرى" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذه الرسالة؟")) return;
    try {
      const res = await apiFetch(`/api/messages/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "تم الحذف بنجاح" });
        fetchMessages();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "خطأ", description: data.error || "ليس لديك صلاحية لحذف هذه الرسالة" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "خطأ", description: "تعذر الحذف" });
    }
  };

  const submitEdit = async (id: number) => {
    if (!editContent.trim()) return;
    try {
      const res = await apiFetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (res.ok) {
        setEditingMsgId(null);
        setEditContent("");
        fetchMessages();
        toast({ title: "تم التعديل بنجاح" });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "خطأ", description: data.error || "ليس لديك صلاحية لتعديل هذه الرسالة" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "خطأ", description: "تعذر التعديل" });
    }
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl" dir="rtl">
      <Card className="h-[75vh] flex flex-col shadow-lg border">
        <CardHeader className="border-b bg-muted/30 py-4 px-6 flex flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-xl">محادثة الدعم الفني</CardTitle>
            <p className="text-xs text-muted-foreground">تواصل مباشرة مع إدارة المنصة بخصوص مشاريعك</p>
          </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {safeMessages.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>لا توجد رسائل سابقة. ابدأ المحادثة وسيقوم فريق الدعم بالرد عليك قريباً.</p>
            </div>
          ) : (
            (Array.isArray(safeMessages) ? safeMessages : []).map((msg) => {
              const isMe = msg.senderId === user?.id;
              const isAdminOrSubadmin = user?.role === "admin" || user?.role === "subadmin";
              
              // السماح بالحذف أو التعديل إذا كانت رسالته أو إذا كان المستخدم أدمن/مشرف
              const canModify = isMe || isAdminOrSubadmin;

              const msgSenderIsAdmin = msg.senderRole === "admin" || msg.senderRole === "subadmin";
              const showEditedTag = msg.isEdited && !msgSenderIsAdmin;

              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  
                  {msg.isDeleted ? (
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm flex items-center gap-2 italic shadow-sm ${isMe ? "bg-muted/50 text-muted-foreground rounded-bl-none" : "bg-gray-100 text-gray-500 border rounded-br-none"}`}>
                      <Ban className="w-4 h-4 opacity-50" />
                      تم حذف هذه الرسالة
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      
                      {/* أزرار الحذف والتعديل ظاهرة ومرنة للموبايل والديسكتوب */}
                      {canModify && !msg.isDeleted && editingMsgId !== msg.id && (
                        <div className="flex items-center gap-1 bg-white/85 p-1 rounded-full shadow-sm border">
                          {!msgSenderIsAdmin && (
                            <button onClick={() => { setEditingMsgId(msg.id); setEditContent(msg.content); }} className="p-1 text-muted-foreground hover:text-blue-600 transition-colors" title="تعديل">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(msg.id)} className="p-1 text-muted-foreground hover:text-red-600 transition-colors" title="حذف">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className={`max-w-[100%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${isMe ? "bg-primary text-primary-foreground rounded-bl-none" : "bg-white border text-foreground rounded-br-none"}`}>
                        {editingMsgId === msg.id ? (
                          <div className="flex flex-col gap-2 min-w-[250px]">
                            <Input value={editContent} onChange={e => setEditContent(e.target.value)} className="h-8 text-black bg-white" />
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={() => setEditingMsgId(null)} className="h-7 text-xs text-white hover:text-gray-200">إلغاء</Button>
                              <Button size="sm" onClick={() => submitEdit(msg.id)} className="h-7 text-xs bg-green-500 hover:bg-green-600 text-white">حفظ</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-line">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-[10px] text-muted-foreground">
                      {msg.createdAt ? format(new Date(msg.createdAt), "hh:mm a - dd MMM", { locale: ar }) : ""}
                    </span>
                    {showEditedTag && !msg.isDeleted && (
                      <span className="text-[10px] text-muted-foreground/70 italic">(تم التعديل)</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <div className="p-4 border-t bg-white">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="اكتب رسالتك هنا..."
              className="h-12 bg-muted/20 rounded-xl"
            />
            <Button type="submit" disabled={loading || !newMessage.trim()} className="h-12 px-6 gap-2 rounded-xl">
              <Send className="w-4 h-4 rtl:-scale-x-100" />
              {loading ? "..." : "إرسال"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
