"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-heading font-bold mb-6">Settings</h1>
      <Card>
        <CardContent className="space-y-4">
          <Input label="Name" id="name" defaultValue="" />
          <Input label="Email" id="email" type="email" defaultValue="" />
          <Button>Save changes</Button>
        </CardContent>
      </Card>
    </div>
  );
}
