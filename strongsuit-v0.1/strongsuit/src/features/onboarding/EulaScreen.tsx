import { useState } from 'react'
import { Card, Button } from '@/design'
import { trainerRepo } from '@/db/repo'
import { nowIso } from '@/lib/core'
import { Logomark } from '@/app/brand/Logomark'
import type { Trainer } from '@/db/types'

export default function EulaScreen({ trainer }: { trainer: Trainer }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false)

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    if (Math.abs(scrollHeight - clientHeight - scrollTop) < 10) {
      setScrolledToBottom(true)
    }
  }

  async function accept() {
    await trainerRepo.patch({ eulaAcceptedAt: nowIso() })
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface2 p-6">
      <Card className="flex h-full max-h-[600px] w-full max-w-2xl flex-col shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <Logomark size={36} />
          <h1 className="text-xl font-bold tracking-tight text-ink">End User License Agreement</h1>
        </div>
        <p className="mb-4 text-sm text-muted">
          {trainer.trainerName ? `${trainer.trainerName}, please` : 'Please'} read and accept the terms of service to use Coachwright.
        </p>
        
        <div 
          className="flex-1 overflow-y-auto rounded border border-line bg-surface2 p-4 text-xs leading-relaxed text-ink"
          onScroll={handleScroll}
        >
          <h2 className="mb-2 font-semibold">1. Disclaimer of Warranty</h2>
          <p className="mb-4 text-faint">
            THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
            IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
            AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
            LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
            OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
            SOFTWARE.
          </p>

          <h2 className="mb-2 font-semibold">2. Liability for Client Health</h2>
          <p className="mb-4 text-faint">
            You, the Coach, are solely responsible for the safety and well-being of your clients. 
            Coachwright provides software tools for program management and takes zero responsibility 
            for injuries, health issues, or damages resulting from workout programs delivered through 
            the application. You are strongly advised to require physical waivers and PAR-Q forms 
            from your clients.
          </p>

          <h2 className="mb-2 font-semibold">3. Data Storage & Loss</h2>
          <p className="mb-4 text-faint">
            Your client database is stored in your Coachwright account on our servers and cached on the
            devices you sign in on. We keep regular backups of our servers, but you remain responsible for
            keeping your own exports. Coachwright shall not be held liable for any data loss, hardware
            failure, or synchronization conflicts.
          </p>

          <h2 className="mb-2 font-semibold">4. Privacy & Security</h2>
          <p className="mb-4 text-faint">
            Data is encrypted in transit (HTTPS) and access to your account is protected by your password.
            Data on our servers is not end-to-end encrypted, so that it can reach every device you sign in on
            and the clients you connect. We do not sell your data or use it for advertising. While we strive to
            employ modern security practices, we do not guarantee absolute protection against targeted
            attacks or device compromise.
          </p>
          
          <p className="mt-8 text-center text-muted italic">
            Scroll to the bottom to accept.
          </p>
        </div>

        <div className="mt-6 flex justify-end">
          <Button 
            variant="primary" 
            disabled={!scrolledToBottom} 
            onClick={accept}
          >
            I Accept the Terms
          </Button>
        </div>
      </Card>
    </div>
  )
}
