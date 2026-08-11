import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare } from "lucide-react";
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

  const fetchMessages = async () => {
    try {
      const res = await apiFetch("/api/messages");
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
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
          {messages.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>لا توجد رسائل سابقة. ابدأ المحادثة وسيقوم فريق الدعم بالرد عليك قريباً.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      isMe ? "bg-primary text-primary-foreground rounded-bl-none" : "bg-white border text-foreground rounded-br-none"
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {msg.createdAt ? format(new Date(msg.createdAt), "hh:mm a - dd MMM", { locale: ar }) : ""}
                  </span>
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
              className="h-12 bg-muted/20"
            />
            <Button type="submit" disabled={loading || !newMessage.trim()} className="h-12 px-6 gap-2">
              <Send className="w-4 h-4" />
              {loading ? "جاري الإرسال..." : "إرسال"}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}